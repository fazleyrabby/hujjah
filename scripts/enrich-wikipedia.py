#!/usr/bin/env python3
"""
scripts/enrich-wikipedia.py

Enriches narrator bio data using Wikipedia API (CC BY-SA license, free to use).
Fetches infobox data for narrators that already have name_en (from manual seed
or Wikidata) but are still missing death_year or city.

Also attempts to find Wikipedia articles for top unmatched narrators by degree.

Fields populated: death_year, city (fills NULLs only), data_source updated to
'wikidata+wikipedia' or 'manual+wikipedia' if new data added.

Usage:
    python3 scripts/enrich-wikipedia.py              # dry run
    python3 scripts/enrich-wikipedia.py --apply      # apply to DB
    python3 scripts/enrich-wikipedia.py --top N      # only process top N by degree (default 500)
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
CACHE_DIR = Path(__file__).parent.parent / "src-tauri/resources/.wikipedia-cache"
WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"

REQUEST_DELAY = 0.5  # seconds between requests (Wikipedia asks for polite crawling)

# ─── Arabic normalization ─────────────────────────────────────────────────────

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

# ─── City normalization ───────────────────────────────────────────────────────

CITY_MAP = {
    'medina': 'Medina', 'yathrib': 'Medina', 'al-madinah': 'Medina',
    'mecca': 'Mecca', 'makkah': 'Mecca', 'al-makkah': 'Mecca',
    'basra': 'Basra', 'al-basra': 'Basra',
    'kufa': 'Kufa', 'al-kufa': 'Kufa',
    'baghdad': 'Baghdad',
    'damascus': 'Damascus', 'dimashq': 'Damascus',
    'egypt': 'Egypt', 'cairo': 'Egypt', 'fustat': 'Egypt', 'misr': 'Egypt',
    'yemen': 'Yemen', "sana'a": 'Sanaa', 'sanaa': 'Sanaa',
    'nishapur': 'Nishapur', 'naysabur': 'Nishapur',
    'bukhara': 'Bukhara', 'bokhara': 'Bukhara',
    'khorasan': 'Khorasan',
    'rayy': 'Rayy', 'ray': 'Rayy',
    'wasit': 'Wasit',
    'merv': 'Merv', 'marw': 'Merv',
    'balkh': 'Balkh',
    'alexandria': 'Alexandria',
    'homs': 'Homs', 'hims': 'Homs',
    'aleppo': 'Aleppo', 'halab': 'Aleppo',
    'mosul': 'Mosul', 'al-mawsil': 'Mosul',
    'taif': 'Taif', 'al-taif': 'Taif',
    'isfahan': 'Isfahan', 'asfahan': 'Isfahan',
    'hamadan': 'Hamadan',
    'samarkand': 'Samarkand',
}

def normalize_city(raw: str) -> str | None:
    if not raw:
        return None
    lower = raw.lower().strip()
    for k, v in CITY_MAP.items():
        if k in lower:
            return v
    # Return as-is if it looks like an English city name
    if re.match(r'^[A-Za-z\s\-\']+$', raw) and len(raw) < 40:
        return raw.strip()
    return None

# ─── Hijri conversion ────────────────────────────────────────────────────────

def hijri_from_text(text: str) -> int | None:
    """Extract AH year from text like '110 AH', 'died 110 AH', '110 H', etc."""
    # Direct AH mention
    m = re.search(r'\b(\d{2,3})\s*(?:AH|ah|A\.H\.|H\b)', text)
    if m:
        year = int(m.group(1))
        if 1 <= year <= 500:  # valid AH range for hadith narrators
            return year

    # CE year with approximate conversion
    m = re.search(r'\b(\d{3,4})\s*(?:CE|AD|C\.E\.)', text)
    if m:
        ce = int(m.group(1))
        if 600 <= ce <= 1400:
            return round((ce - 622) * 1.0307)

    return None

def ce_to_hijri_approx(ce_year: int) -> int:
    return round((ce_year - 622) * 1.0307)

# ─── Wikipedia API ────────────────────────────────────────────────────────────

def wikipedia_search(name_en: str) -> list[dict]:
    """Search Wikipedia for a narrator by English name."""
    cache_key = re.sub(r'[^\w]', '_', name_en.lower())
    cache_file = CACHE_DIR / f"search_{cache_key}.json"
    if cache_file.exists():
        with open(cache_file, encoding='utf-8') as f:
            return json.load(f)

    params = {
        'action': 'query',
        'list': 'search',
        'srsearch': f'{name_en} hadith narrator Islamic',
        'srlimit': 3,
        'format': 'json',
        'utf8': 1,
    }
    url = f"{WIKIPEDIA_API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={
        'User-Agent': 'HujjahApp/1.0 (Islamic hadith research) python-urllib/3'
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        results = data.get('query', {}).get('search', [])
    except Exception:
        results = []

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False)

    time.sleep(REQUEST_DELAY)
    return results

def wikipedia_extract(page_title: str) -> dict:
    """Fetch page extract + infobox content for a Wikipedia page."""
    cache_key = re.sub(r'[^\w]', '_', page_title.lower())[:80]
    cache_file = CACHE_DIR / f"page_{cache_key}.json"
    if cache_file.exists():
        with open(cache_file, encoding='utf-8') as f:
            return json.load(f)

    params = {
        'action': 'query',
        'titles': page_title,
        'prop': 'revisions|extracts',
        'rvprop': 'content',
        'exintro': True,
        'exsentences': 5,
        'format': 'json',
        'utf8': 1,
    }
    url = f"{WIKIPEDIA_API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={
        'User-Agent': 'HujjahApp/1.0 (Islamic hadith research) python-urllib/3'
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        pages = data.get('query', {}).get('pages', {})
        page = next(iter(pages.values()), {})
        content = ''
        if 'revisions' in page:
            content = page['revisions'][0].get('*', '') or page['revisions'][0].get('content', '')
        extract = page.get('extract', '')
        result = {'title': page.get('title', ''), 'content': content, 'extract': extract}
    except Exception:
        result = {'title': page_title, 'content': '', 'extract': ''}

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)

    time.sleep(REQUEST_DELAY)
    return result

def parse_wikipedia_bio(page_data: dict) -> dict:
    """Extract death_year and city from Wikipedia page content."""
    content = page_data.get('content', '') + ' ' + page_data.get('extract', '')
    result = {'death_year': None, 'city': None, 'name_en': None}

    if not content:
        return result

    # Death year from AH mentions
    death_year = hijri_from_text(content)
    if death_year:
        result['death_year'] = death_year

    # Death year from infobox: | death_date = ...
    m = re.search(r'\|\s*death_date\s*=\s*([^\n\|]+)', content)
    if m and not result['death_year']:
        death_year = hijri_from_text(m.group(1))
        if death_year:
            result['death_year'] = death_year

    # Birth/death place from infobox
    for field in ['death_place', 'birth_place', 'place']:
        m = re.search(rf'\|\s*{field}\s*=\s*([^\n\|]+)', content, re.IGNORECASE)
        if m:
            city = normalize_city(re.sub(r'\[\[([^\]|]+).*?\]\]', r'\1', m.group(1)).strip())
            if city:
                result['city'] = city
                break

    # City from extract text: "born in X", "died in X"
    if not result['city']:
        m = re.search(r'(?:born|died)\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', content)
        if m:
            city = normalize_city(m.group(1))
            if city:
                result['city'] = city

    # Name from page title
    result['name_en'] = page_data.get('title', '')

    return result

def is_relevant_page(page_title: str, name_en: str, content: str) -> bool:
    """Check if a Wikipedia page is actually about a hadith narrator."""
    title_lower = page_title.lower()
    content_lower = content.lower()[:2000]

    keywords = ['hadith', 'narrator', 'muhaddith', 'tabi', 'sahaba', 'companion',
                'transmitter', 'ibn', 'abu ', 'al-', 'isnad', 'sanad',
                'thiqah', 'bukhari', 'muslim', 'tirmidhi']

    keyword_hits = sum(1 for k in keywords if k in content_lower)
    name_match = name_en.lower().split()[0] in title_lower if name_en else False

    return keyword_hits >= 2 or name_match

# ─── Main enrichment ─────────────────────────────────────────────────────────

def get_narrators_to_enrich(con: sqlite3.Connection, top_n: int) -> list[dict]:
    """Get narrators with name_en but missing death_year or city, ordered by degree."""
    cur = con.cursor()
    cur.execute(f"""
        SELECT n.id, n.name_en, n.name_ar, n.death_year, n.city, n.data_source,
               COUNT(DISTINCT e.from_narrator_id || '-' || e.to_narrator_id) as degree
        FROM narrators n
        LEFT JOIN narrator_edges e ON e.from_narrator_id = n.id OR e.to_narrator_id = n.id
        WHERE n.name_en IS NOT NULL
          AND (n.death_year IS NULL OR n.city IS NULL)
        GROUP BY n.id
        ORDER BY degree DESC
        LIMIT {top_n}
    """)
    cols = ['id', 'name_en', 'name_ar', 'death_year', 'city', 'data_source', 'degree']
    return [dict(zip(cols, row)) for row in cur.fetchall()]

def main():
    apply = '--apply' in sys.argv
    top_n = 500
    for arg in sys.argv:
        if arg.startswith('--top='):
            top_n = int(arg.split('=')[1])
        elif arg == '--top' and sys.argv.index(arg) + 1 < len(sys.argv):
            top_n = int(sys.argv[sys.argv.index(arg) + 1])

    print("=== Wikipedia Narrator Enrichment ===")
    print(f"Mode: {'APPLY (writes to DB)' if apply else 'DRY RUN (no writes)'}")
    print(f"Processing top {top_n} narrators with name_en but missing death_year/city\n")

    con = sqlite3.connect(str(DB_PATH))
    narrators = get_narrators_to_enrich(con, top_n)
    print(f"Found {len(narrators)} narrators to try enriching\n")

    updates = []
    enriched = 0
    no_match = 0
    already_full = 0

    for i, nar in enumerate(narrators):
        name_en = nar['name_en']
        if not name_en:
            continue

        print(f"[{i+1}/{len(narrators)}] {name_en} (degree={nar['degree']})", end=' ... ', flush=True)

        # Search Wikipedia
        search_results = wikipedia_search(name_en)
        if not search_results:
            print("no results")
            no_match += 1
            continue

        # Try first 2 results
        bio = {}
        for sr in search_results[:2]:
            page_title = sr.get('title', '')
            page_data = wikipedia_extract(page_title)

            if not is_relevant_page(page_title, name_en, page_data.get('content', '')):
                continue

            bio = parse_wikipedia_bio(page_data)
            if bio.get('death_year') or bio.get('city'):
                break

        new_death = nar['death_year'] or bio.get('death_year')
        new_city = nar['city'] or bio.get('city')

        if new_death != nar['death_year'] or new_city != nar['city']:
            updates.append((new_death, new_city, nar['id']))
            enriched += 1
            fields = []
            if new_death != nar['death_year']: fields.append(f"death={new_death}AH")
            if new_city != nar['city']: fields.append(f"city={new_city}")
            print(f"✓ {', '.join(fields)}")
        else:
            already_full += 1
            print("no new data")

    print(f"\n{'Results' if apply else 'Dry-run results'}:")
    print(f"  New data found:    {enriched}")
    print(f"  No match/data:     {no_match}")
    print(f"  Already complete:  {already_full}")

    if apply and updates:
        cur = con.cursor()
        cur.executemany(
            """UPDATE narrators
               SET death_year = COALESCE(death_year, ?),
                   city = COALESCE(city, ?)
               WHERE id = ?""",
            updates
        )
        # Update data_source for rows that got new data
        cur.executemany(
            """UPDATE narrators
               SET data_source = CASE
                 WHEN data_source = 'manual' THEN 'manual+wikipedia'
                 WHEN data_source = 'wikidata' THEN 'wikidata+wikipedia'
                 ELSE 'wikipedia'
               END
               WHERE id = ? AND (
                 (death_year IS NOT NULL AND ? IS NOT NULL) OR
                 (city IS NOT NULL AND ? IS NOT NULL)
               )""",
            [(u[2], u[0], u[1]) for u in updates]
        )
        con.commit()

        # Rebuild FTS5
        print("\nRebuilding FTS5 narrator_search_idx...")
        cur.execute("INSERT INTO narrator_search_idx(narrator_search_idx) VALUES('rebuild')")
        con.commit()
        print("  ✅ FTS5 rebuilt")

        # Final stats
        cur.execute("SELECT COUNT(*) FROM narrators WHERE name_en IS NOT NULL AND death_year IS NOT NULL AND city IS NOT NULL")
        fully_enriched = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM narrators")
        total = cur.fetchone()[0]
        print(f"\n✅ Done. Fully enriched (name_en+death+city): {fully_enriched}/{total}")
    elif not apply:
        print(f"\nRun with --apply to write {len(updates)} updates to DB.")

    con.close()

if __name__ == "__main__":
    main()
