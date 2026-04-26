#!/usr/bin/env python3
"""
scripts/enrich-wikidata.py

Enriches narrator bio data using Wikidata SPARQL API (100% open, CC0 license).
Matches Wikidata hadith transmitters against narrators in hujjah-hadith-core.db
using normalized Arabic name matching.

Fields populated: name_en, death_year, city, data_source='wikidata'
(reliability not available on Wikidata — that comes from classical rijal sources only)

Usage:
    python3 scripts/enrich-wikidata.py              # dry run — shows matches, no writes
    python3 scripts/enrich-wikidata.py --apply      # apply to DB
    python3 scripts/enrich-wikidata.py --dump       # dump raw Wikidata results to JSON
"""

import sys
import re
import json
import sqlite3
import time
import urllib.request
import urllib.parse
from pathlib import Path

# ─── Config ───────────────────────────────────────────────────────────────────

DB_PATH = Path(__file__).parent.parent / "src-tauri/resources/hujjah-hadith-core.db"
CACHE_PATH = Path(__file__).parent.parent / "src-tauri/resources" / ".wikidata-cache.json"
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"

SPARQL_QUERY = """
SELECT DISTINCT
  ?person
  ?personArabicLabel
  ?personEnglishLabel
  ?died
  ?birthPlaceLabel
  ?deathPlaceLabel
WHERE {
  # Religion: Islam — the only reliable anchor for Islamic-era figures
  ?person wdt:P140 wd:Q432 .

  # Must have a death date within the classical hadith transmission era
  # (After Hijra 622 CE through end of classical hadith period ~1300 CE)
  ?person wdt:P570 ?died .
  FILTER(?died >= "0622-01-01T00:00:00Z"^^xsd:dateTime)
  FILTER(?died <= "1300-01-01T00:00:00Z"^^xsd:dateTime)

  # Must have an Arabic name (filters out any stray non-Arabic entries)
  ?person rdfs:label ?personArabicLabel .
  FILTER(LANG(?personArabicLabel) = "ar")

  OPTIONAL { ?person rdfs:label ?personEnglishLabel . FILTER(LANG(?personEnglishLabel) = "en") }
  OPTIONAL { ?person wdt:P19 ?birthPlace }
  OPTIONAL { ?person wdt:P20 ?deathPlace }

  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en" .
    ?birthPlace rdfs:label ?birthPlaceLabel .
    ?deathPlace rdfs:label ?deathPlaceLabel .
  }
}
ORDER BY ?died
LIMIT 3000
"""

# Hijri year approximation: subtract 622 from CE year, adjust
def ce_to_hijri_approx(ce_year: int) -> int:
    """Approximate CE year to AH year."""
    return round((ce_year - 622) * 1.0307)

# City name normalization to English
CITY_MAP = {
    'المدينة المنورة': 'Medina', 'Medina': 'Medina', 'Yathrib': 'Medina',
    'مكة المكرمة': 'Mecca', 'مكة': 'Mecca', 'Mecca': 'Mecca',
    'البصرة': 'Basra', 'Basra': 'Basra',
    'الكوفة': 'Kufa', 'Kufa': 'Kufa',
    'بغداد': 'Baghdad', 'Baghdad': 'Baghdad',
    'دمشق': 'Damascus', 'Damascus': 'Damascus',
    'الشام': 'Damascus', 'Syria': 'Damascus',
    'مصر': 'Egypt', 'Egypt': 'Egypt', 'Cairo': 'Egypt', 'Fustat': 'Egypt',
    'اليمن': 'Yemen', 'Yemen': 'Yemen', "Sana'a": 'Sanaa', 'Sanaa': 'Sanaa',
    'نيسابور': 'Nishapur', 'Nishapur': 'Nishapur',
    'بخارى': 'Bukhara', 'Bukhara': 'Bukhara',
    'خراسان': 'Khorasan', 'Khorasan': 'Khorasan',
    'الري': 'Rayy', 'Rayy': 'Rayy', 'Ray': 'Rayy',
    'واسط': 'Wasit', 'Wasit': 'Wasit',
    'الأندلس': 'Andalusia', 'Cordoba': 'Andalusia',
    'مرو': 'Merv', 'Merv': 'Merv',
    'بلخ': 'Balkh', 'Balkh': 'Balkh',
    'صنعاء': 'Sanaa',
    'الإسكندرية': 'Alexandria', 'Alexandria': 'Alexandria',
    'تونس': 'Tunisia', 'Kairouan': 'Tunisia',
    'طبرستان': 'Tabaristan',
    'همدان': 'Hamadan', 'Hamadan': 'Hamadan',
    'أصبهان': 'Isfahan', 'Isfahan': 'Isfahan',
    'جرجان': 'Jurjan',
    'حمص': 'Homs', 'Homs': 'Homs',
    'حلب': 'Aleppo', 'Aleppo': 'Aleppo',
    'الموصل': 'Mosul', 'Mosul': 'Mosul',
    'الطائف': 'Taif', 'Taif': 'Taif',
}

def normalize_city(raw: str) -> str | None:
    if not raw:
        return None
    for k, v in CITY_MAP.items():
        if k.lower() in raw.lower() or raw.lower() in k.lower():
            return v
    # Return cleaned English city name if no mapping
    if re.match(r'^[A-Za-z\s\-\']+$', raw):
        return raw.strip()
    return None

# ─── Arabic normalization (mirrors normalize-arabic.py) ───────────────────────

def normalize_arabic(text: str) -> str:
    if not text:
        return ''
    text = re.sub(r'[\u064B-\u065F\u0670]', '', text)
    text = text.replace('ى', 'ي')
    text = text.replace('ة', 'ه')
    text = re.sub(r'[\u0622\u0623\u0625\u0671]', '\u0627', text)
    text = text.replace('\u0640', '')
    text = re.sub(r'\s+', ' ', text).strip()
    return text

# ─── Wikidata fetch ────────────────────────────────────────────────────────────

def fetch_wikidata(use_cache: bool = True) -> list[dict]:
    """Fetch narrator data from Wikidata SPARQL endpoint."""

    if use_cache and CACHE_PATH.exists():
        print(f"Loading cached Wikidata results from {CACHE_PATH}")
        with open(CACHE_PATH, encoding='utf-8') as f:
            return json.load(f)

    print("Fetching from Wikidata SPARQL API...")
    params = urllib.parse.urlencode({
        'query': SPARQL_QUERY,
        'format': 'json'
    })
    url = f"{WIKIDATA_SPARQL}?{params}"
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'HujjahApp/1.0 (Islamic hadith research; github.com/hujjah) python-urllib/3',
            'Accept': 'application/sparql-results+json',
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print(f"ERROR fetching Wikidata: {e}")
        sys.exit(1)

    results = data.get('results', {}).get('bindings', [])
    print(f"Received {len(results)} results from Wikidata")

    # Save cache
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_PATH, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"Cached to {CACHE_PATH}")

    return results

def parse_wikidata_results(results: list[dict]) -> list[dict]:
    """Parse raw SPARQL bindings into clean dicts."""
    seen_qids = set()
    narrators = []

    for r in results:
        qid = r.get('person', {}).get('value', '').split('/')[-1]
        if qid in seen_qids:
            continue
        seen_qids.add(qid)

        name_ar = r.get('personArabicLabel', {}).get('value', '')
        name_en = r.get('personEnglishLabel', {}).get('value', '')

        # Skip if no Arabic name
        if not name_ar:
            continue

        # Parse death year — only accept Islamic-era CE years (570–1500)
        death_year = None
        died_raw = r.get('died', {}).get('value', '')
        if died_raw:
            m = re.search(r'(-?\d{1,4})-\d{2}-\d{2}', died_raw)
            if m:
                ce_year = int(m.group(1))
                if 570 <= ce_year <= 1500:
                    death_year = ce_to_hijri_approx(ce_year)
                else:
                    # Pre-Islamic or post-classical — skip entirely
                    continue

        # Parse city — prefer death place, fall back to birth place
        city = None
        for city_field in ['deathPlaceLabel', 'birthPlaceLabel']:
            raw_city = r.get(city_field, {}).get('value', '')
            if raw_city:
                city = normalize_city(raw_city)
            if city:
                break

        narrators.append({
            'qid': qid,
            'name_ar': name_ar,
            'name_en': name_en,
            'death_year': death_year,
            'city': city,
        })

    return narrators

# ─── DB matching ──────────────────────────────────────────────────────────────

def load_db_narrators(con: sqlite3.Connection) -> dict[str, list[int]]:
    """Build normalized name → [narrator_ids] lookup from DB."""
    cur = con.cursor()
    cur.execute("SELECT id, name_ar FROM narrators")
    lookup: dict[str, list[int]] = {}
    for nid, name_ar in cur.fetchall():
        norm = normalize_arabic(name_ar)
        lookup.setdefault(norm, []).append(nid)
    return lookup

def match_and_enrich(
    wikidata_narrators: list[dict],
    db_lookup: dict[str, list[int]],
    con: sqlite3.Connection,
    dry_run: bool = True,
) -> dict:
    """Match Wikidata narrators to DB entries and update."""
    cur = con.cursor()

    matched = 0
    skipped_already_enriched = 0
    unmatched = 0
    updates: list[tuple] = []

    for nar in wikidata_narrators:
        norm = normalize_arabic(nar['name_ar'])
        if not norm:
            continue

        ids = db_lookup.get(norm, [])
        if not ids:
            unmatched += 1
            continue

        for nid in ids:
            # Check if already has full bio from manual seed — don't overwrite
            cur.execute(
                "SELECT name_en, data_source FROM narrators WHERE id = ?", (nid,)
            )
            row = cur.fetchone()
            if row and row[1] == 'manual':
                skipped_already_enriched += 1
                continue

            # Only update fields that are currently NULL
            cur.execute(
                "SELECT name_en, death_year, city FROM narrators WHERE id = ?", (nid,)
            )
            existing = cur.fetchone()
            if not existing:
                continue

            ex_name_en, ex_death, ex_city = existing
            new_name_en = ex_name_en or (nar['name_en'] or None)
            new_death = ex_death or nar['death_year']
            new_city = ex_city or nar['city']

            if new_name_en != ex_name_en or new_death != ex_death or new_city != ex_city:
                updates.append((new_name_en, new_death, new_city, nid))
                matched += 1

    if not dry_run and updates:
        cur.executemany(
            """UPDATE narrators
               SET name_en = ?, death_year = ?, city = ?, data_source = 'wikidata'
               WHERE id = ? AND (data_source IS NULL OR data_source = 'computed')""",
            updates
        )
        con.commit()

    return {
        'matched': matched,
        'skipped_already_enriched': skipped_already_enriched,
        'unmatched': unmatched,
        'updates_queued': len(updates),
    }

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    apply = '--apply' in sys.argv
    dump = '--dump' in sys.argv
    no_cache = '--no-cache' in sys.argv

    print("=== Wikidata Narrator Enrichment ===")
    print(f"Mode: {'APPLY (writes to DB)' if apply else 'DRY RUN (no writes)'}\n")

    # 1. Fetch from Wikidata
    raw = fetch_wikidata(use_cache=not no_cache)

    # 2. Parse
    narrators = parse_wikidata_results(raw)
    print(f"Parsed {len(narrators)} unique narrators from Wikidata")
    print(f"  With name_en:    {sum(1 for n in narrators if n['name_en'])}")
    print(f"  With death_year: {sum(1 for n in narrators if n['death_year'])}")
    print(f"  With city:       {sum(1 for n in narrators if n['city'])}")

    if dump:
        dump_path = Path(__file__).parent.parent / "src-tauri/resources/.wikidata-parsed.json"
        with open(dump_path, 'w', encoding='utf-8') as f:
            json.dump(narrators, f, ensure_ascii=False, indent=2)
        print(f"\nDumped parsed results to {dump_path}")

    # 3. Load DB
    print(f"\nConnecting to DB: {DB_PATH}")
    con = sqlite3.connect(str(DB_PATH))
    db_lookup = load_db_narrators(con)
    print(f"Loaded {len(db_lookup)} unique normalized narrator names from DB")

    # 4. Match
    stats = match_and_enrich(narrators, db_lookup, con, dry_run=not apply)
    con.close()

    print(f"\n{'Results' if apply else 'Dry-run results'}:")
    print(f"  Matched + updated:         {stats['matched']}")
    print(f"  Skipped (manual seed):     {stats['skipped_already_enriched']}")
    print(f"  Unmatched (not in DB):     {stats['unmatched']}")

    if apply:
        print(f"\n✅ Applied {stats['updates_queued']} updates to DB (data_source='wikidata')")

        # Verify
        con = sqlite3.connect(str(DB_PATH))
        cur = con.cursor()
        cur.execute("SELECT COUNT(*) FROM narrators WHERE data_source = 'wikidata'")
        wikidata_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM narrators WHERE name_en IS NOT NULL")
        total_enriched = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM narrators")
        total = cur.fetchone()[0]

        print(f"\nDB State:")
        print(f"  Wikidata-enriched:  {wikidata_count}")
        print(f"  Total with name_en: {total_enriched}/{total}")

        # Rebuild FTS5
        print("\nRebuilding FTS5 narrator_search_idx...")
        cur.execute("INSERT INTO narrator_search_idx(narrator_search_idx) VALUES('rebuild')")
        con.commit()
        print("  ✅ FTS5 rebuilt")
        con.close()
    else:
        print(f"\nRun with --apply to write changes to DB.")
        print(f"Run with --dump to export parsed Wikidata results to JSON.")

if __name__ == "__main__":
    main()
