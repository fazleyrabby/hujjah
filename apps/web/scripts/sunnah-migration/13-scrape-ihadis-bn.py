#!/usr/bin/env python3
"""
scripts/sunnah-migration/13-scrape-ihadis-bn.py

Scrape Bengali translations from ihadis.com → save to JSON files.
ihadis.com robots.txt: Allow: / for all bots (as of 2026-04-29).
Source: Islamic Foundation Bangladesh translations.

Output: scraped/{collection}.json
Format: [{"ihadis_num": 1, "narrator": "...", "translation": "...", "note": "..."}, ...]

Import with: python3 14-import-ihadis-bn.py

Collections:
  mishkat        → mishkatul-masabih   (4,433 missing BN)
  riyadussalihin → riyadus-salihin     (1,896 missing BN)
  adab           → adabul-mufrad       (1,185 missing BN)
  shamail        → shamayele-tirmidhi  (402 missing BN)
  bulugh         → bulugul-maram       (378 missing BN)

Usage:
  python3 13-scrape-ihadis-bn.py --collection mishkat --limit 20  # test
  python3 13-scrape-ihadis-bn.py --collection mishkat             # full
  python3 13-scrape-ihadis-bn.py --all                            # all collections
"""

import argparse
import json
import os
import re
import sqlite3
import time
import urllib.request
import urllib.error
import sys

SQLITE_DB  = '/Users/rabbi/Desktop/Projects/hujjah/apps/tauri/src-tauri/resources/hujjah-hadith-core.db'
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'scraped')
RATE_LIMIT = 8.0   # req/sec
TIMEOUT    = 15

COLLECTIONS = {
    'mishkat':        ('mishkatul-masabih',  'mishkat'),
    'riyadussalihin': ('riyadus-salihin',    'riyadussalihin'),
    'adab':           ('adabul-mufrad',      'adab'),
    'shamail':        ('shamayele-tirmidhi', 'shamail'),
    'bulugh':         ('bulugul-maram',      'bulugh'),
}


def extract_rsc_text_chunks(html: str) -> dict[str, str]:
    """
    Build a map of RSC chunk_id → text content.
    Pattern: push([1,"46:T1591,"]) followed immediately by push([1,"actual text"])
    """
    text_map = {}
    all_pushes = re.findall(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)', html)

    for i, p in enumerate(all_pushes):
        # Match "N:T{length}," pattern
        m = re.match(r'^(\d+):T\d+,$', p)
        if m and i + 1 < len(all_pushes):
            key = m.group(1)
            try:
                text = json.loads(f'"{all_pushes[i+1]}"')
                text_map[f'${key}'] = text
            except:
                pass

    return text_map


def fetch_hadith(ihadis_slug: str, hadith_num: int) -> dict | None:
    url = f'https://ihadis.com/{ihadis_slug}/hadith/{hadith_num}'
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'Mozilla/5.0 (compatible; Hujjah-Bot/1.0)'}
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            html = r.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise

    # Build text chunk map for lazy-loaded content ($46, $45, etc.)
    text_map = extract_rsc_text_chunks(html)

    # Decode all RSC JSON chunks
    chunks = re.findall(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)', html)
    all_text = ''
    for c in chunks:
        try:
            all_text += json.loads(f'"{c}"')
        except:
            pass

    # Extract full hadith object from RSC payload
    hadith_m = re.search(r'"hadith":(\{"id":"[^}]{0,8000}\})', all_text, re.DOTALL)
    if hadith_m:
        try:
            data = json.loads(hadith_m.group(1))
            # Resolve lazy references
            for key in ('translation', 'arabic', 'narrator'):
                val = data.get(key, '')
                if isinstance(val, str) and val.startswith('$') and val in text_map:
                    data[key] = text_map[val]
            return data
        except:
            pass

    # Fallback: extract key fields individually
    trans_m    = re.search(r'"translation":"((?:[^"\\]|\\.)*)"', all_text)
    narrator_m = re.search(r'"narrator":"((?:[^"\\]|\\.)*)"', all_text)
    note_m     = re.search(r'"note":"((?:[^"\\]|\\.)*)"', all_text)
    if trans_m:
        trans = trans_m.group(1)
        if trans.startswith('$') and trans in text_map:
            trans = text_map[trans]
        return {
            'id': str(hadith_num),
            'translation': trans,
            'narrator': narrator_m.group(1) if narrator_m else '',
            'note': note_m.group(1) if note_m else '',
        }
    return None


def get_hadith_numbers(db: sqlite3.Connection, sunnah_col: str) -> list[tuple[int, str]]:
    """Return (hadith_id, sunnah_hadith_number) for all hadiths in collection."""
    return db.execute("""
        SELECT h.id, h.sunnah_hadith_number
        FROM hadiths h
        WHERE h.sunnah_collection = ?
          AND h.sunnah_hadith_number IS NOT NULL
        ORDER BY CAST(h.sunnah_hadith_number AS REAL)
    """, (sunnah_col,)).fetchall()


def scrape_collection(db: sqlite3.Connection, ihadis_slug: str, sunnah_col: str, col_key: str, limit: int = 0):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, f'{col_key}.json')

    # Load existing progress
    existing = {}
    if os.path.exists(out_path):
        with open(out_path) as f:
            for entry in json.load(f):
                existing[entry['ihadis_num']] = entry
        print(f'  Resuming — {len(existing):,} already scraped')

    all_hadiths = get_hadith_numbers(db, sunnah_col)
    if limit:
        all_hadiths = all_hadiths[:limit]

    # Figure out which numbers to fetch
    nums_to_fetch = []
    for hadith_id, sunnah_num in all_hadiths:
        num_str = str(sunnah_num).strip()
        if not num_str:
            continue
        try:
            n = int(num_str.split()[0])
        except ValueError:
            continue
        if n not in existing:
            nums_to_fetch.append((hadith_id, n, sunnah_num))

    total = len(nums_to_fetch)
    print(f'\n[{col_key}] {len(all_hadiths):,} total | {len(existing):,} done | {total:,} to fetch')
    if total == 0:
        print('  Nothing to do.')
        return

    interval = 1.0 / RATE_LIMIT
    fetched = 0
    not_found = 0
    errors = 0

    results = list(existing.values())

    for i, (hadith_id, ihadis_num, sunnah_num) in enumerate(nums_to_fetch):
        t0 = time.time()
        try:
            data = fetch_hadith(ihadis_slug, ihadis_num)
        except Exception as e:
            print(f'  ERROR {ihadis_num} — {e}')
            errors += 1
            time.sleep(2)
            continue

        if data is None:
            not_found += 1
        else:
            narrator = data.get('narrator', '') or ''
            translation = data.get('translation', '') or ''
            note = data.get('note', '') or ''

            # Skip React placeholders
            if narrator.startswith('$'):
                narrator = ''

            entry = {
                'ihadis_num':  ihadis_num,
                'sunnah_num':  sunnah_num,
                'hadith_id':   hadith_id,
                'narrator':    narrator,
                'translation': translation,
                'note':        note,
            }
            results.append(entry)
            fetched += 1

        # Save progress every 50
        if (i + 1) % 50 == 0:
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            pct = (i + 1) / total * 100
            print(f'  {i+1:,}/{total:,} ({pct:.0f}%) | fetched={fetched:,} not_found={not_found:,} errors={errors:,}')

        elapsed = time.time() - t0
        wait = interval - elapsed
        if wait > 0:
            time.sleep(wait)

    # Final save
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f'\n  Saved to {out_path}')
    print(f'  fetched={fetched:,} not_found={not_found:,} errors={errors:,}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--collection', choices=list(COLLECTIONS.keys()))
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--limit', type=int, default=0)
    args = parser.parse_args()

    if not args.collection and not args.all:
        parser.print_help()
        sys.exit(1)

    db = sqlite3.connect(SQLITE_DB)
    db.execute('PRAGMA journal_mode = WAL')

    cols = list(COLLECTIONS.keys()) if args.all else [args.collection]
    for col_key in cols:
        ihadis_slug, sunnah_col = COLLECTIONS[col_key]
        scrape_collection(db, ihadis_slug, sunnah_col, col_key, limit=args.limit)

    db.close()
    print('\n[All done]')


if __name__ == '__main__':
    main()
