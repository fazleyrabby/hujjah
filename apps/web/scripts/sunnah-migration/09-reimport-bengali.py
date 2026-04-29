#!/usr/bin/env python3
"""
scripts/sunnah-migration/09-reimport-bengali.py

Fix Bengali translations:
1. Delete wrong hadith-api BN translations (matched by book_id/num_in_book — incorrect)
2. Re-import from fawazahmed0/hadith-api using (sunnah_collection, sunnah_hadith_number)
3. Filter Arabic-only chapter heading entries (< BN_MIN_RATIO Bengali chars)
4. Covers: bukhari, muslim, abudawud, ibnmajah, tirmidhi, nasai, forty (nawawi)
"""

import sqlite3
import urllib.request
import json
import sys

SQLITE_DB = '/Users/rabbi/Desktop/Projects/hujjah/apps/tauri/src-tauri/resources/hujjah-hadith-core.db'
BATCH_SIZE = 500

# fawazahmed0 collection slug → (our sunnah_collection, CDN path)
COLLECTIONS = {
    # bukhari: skipped — fawazahmed0 ben-bukhari is Arabic text, not Bengali
    # muslim: skipped — fawazahmed0 ben-muslim entries are all empty
    'abudawud':     'ben-abudawud',
    'ibnmajah':     'ben-ibnmajah',
    'tirmidhi':     'ben-tirmidhi',
    'nasai':        'ben-nasai',
    'forty':        'ben-nawawi',
}

CDN = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/{}.json'

# Minimum fraction of Bengali Unicode chars for text to be considered Bengali
# Bengali: U+0980–U+09FF
BN_MIN_RATIO = 0.10


def is_bengali(text: str) -> bool:
    if not text or len(text) < 10:
        return False
    bn_chars = sum(1 for c in text if '\u0980' <= c <= '\u09FF')
    return (bn_chars / len(text)) >= BN_MIN_RATIO


def normalize_hadith_number(num: str) -> str:
    """
    Normalize sunnah.com hadith numbers for fawazahmed0 lookup.
    "103 a" → "103", "103 b" → "103", "Introduction 10" → skip (return None)
    Plain numbers pass through unchanged.
    """
    s = str(num).strip()
    if s.lower().startswith('introduction'):
        return None
    # Strip trailing letter suffix: "103 a" → "103", "11 b" → "11"
    parts = s.split()
    if len(parts) == 2 and len(parts[1]) == 1 and parts[1].isalpha():
        return parts[0]
    return s


def fetch_edition(slug: str) -> list[dict]:
    url = CDN.format(slug)
    print(f'  Fetching {url}')
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            data = json.load(r)
        return data.get('hadiths', data.get('data', []))
    except Exception as e:
        print(f'  ERROR fetching {slug}: {e}')
        return []


def main():
    print('[ReimportBengali] Starting...\n')

    db = sqlite3.connect(SQLITE_DB)
    db.execute('PRAGMA journal_mode = WAL')
    db.execute('PRAGMA synchronous = NORMAL')

    # Current state
    def counts():
        row = db.execute("""
            SELECT
              COUNT(DISTINCT ht.hadith_id) FILTER (WHERE ht.lang_code='bn')
            FROM hadith_translations ht
            JOIN hadiths h ON h.id=ht.hadith_id
        """).fetchone()
        total = db.execute('SELECT COUNT(*) FROM hadiths').fetchone()[0]
        raw = db.execute("SELECT translator, COUNT(*) FROM hadith_translations WHERE lang_code='bn' GROUP BY translator").fetchall()
        print(f'  Total hadiths: {total:,}  |  valid BN covered: {row[0]:,}')
        for t, c in raw:
            print(f'    {t}: {c:,}')

    print('[State before]')
    counts()

    # Step 1: delete wrong hadith-api BN
    print('\n[Step 1] Deleting wrong hadith-api BN translations...')
    db.execute("DELETE FROM hadith_translations WHERE lang_code='bn' AND translator='hadith-api'")
    deleted = db.total_changes
    db.commit()
    print(f'  Deleted: {deleted:,}')

    # Step 2: build (sunnah_collection, sunnah_hadith_number) → hadith_id map
    print('\n[Step 2] Building hadith map...')
    rows = db.execute("""
        SELECT id, sunnah_collection, sunnah_hadith_number
        FROM hadiths
        WHERE sunnah_collection IS NOT NULL AND sunnah_hadith_number IS NOT NULL
    """).fetchall()
    hadith_map = {}  # (collection, hadith_number_str) → id
    for hid, col, num in rows:
        hadith_map[(col, str(num))] = hid
    print(f'  Indexed {len(hadith_map):,} hadiths with collection+number')

    # Step 3: fetch and insert per collection
    total_inserted = 0
    total_skipped_arabic = 0
    total_no_match = 0

    for our_col, fawaz_slug in COLLECTIONS.items():
        print(f'\n[{our_col}] Fetching {fawaz_slug}...')
        hadiths = fetch_edition(fawaz_slug)
        if not hadiths:
            continue

        print(f'  Got {len(hadiths):,} entries from fawazahmed0')

        batch = []
        inserted = 0
        skipped_arabic = 0
        no_match = 0

        # Build fawazahmed0 number → text map for this collection
        fawaz_map = {}  # normalized_num → text
        for h in hadiths:
            num = str(h.get('hadithnumber', ''))
            text = h.get('text', '')
            if is_bengali(text):
                fawaz_map[num] = text
            else:
                skipped_arabic += 1

        # Match every sunnah.com hadith in this collection
        sunnah_hadiths = [(hid, hnum) for (col, hnum), hid in hadith_map.items() if col == our_col]

        for hadith_id, sunnah_num in sunnah_hadiths:
            fawaz_num = normalize_hadith_number(sunnah_num)
            if fawaz_num is None:
                no_match += 1
                continue

            text = fawaz_map.get(fawaz_num)
            if text is None:
                no_match += 1
                continue

            batch.append((hadith_id, 'bn', text[:5000], 'hadith-api'))

            if len(batch) >= BATCH_SIZE:
                db.executemany(
                    'INSERT OR IGNORE INTO hadith_translations (hadith_id, lang_code, matn_text, translator) VALUES (?,?,?,?)',
                    batch
                )
                db.commit()
                inserted += len(batch)
                batch = []

        if batch:
            db.executemany(
                'INSERT OR IGNORE INTO hadith_translations (hadith_id, lang_code, matn_text, translator) VALUES (?,?,?,?)',
                batch
            )
            db.commit()
            inserted += len(batch)

        print(f'  Inserted: {inserted:,}  |  skipped Arabic: {skipped_arabic:,}  |  no match: {no_match:,}')
        total_inserted += inserted
        total_skipped_arabic += skipped_arabic
        total_no_match += no_match

    # Final state
    print(f'\n[Summary]')
    print(f'  Total inserted:      {total_inserted:,}')
    print(f'  Skipped (Arabic):    {total_skipped_arabic:,}')
    print(f'  No hadith match:     {total_no_match:,}')

    print('\n[State after]')
    counts()

    # Missing BN breakdown
    print('\n[Missing BN by collection]')
    rows = db.execute("""
        SELECT h.sunnah_collection, COUNT(*) as missing
        FROM hadiths h
        WHERE h.id NOT IN (SELECT hadith_id FROM hadith_translations WHERE lang_code='bn')
        GROUP BY h.sunnah_collection ORDER BY missing DESC
    """).fetchall()
    for col, cnt in rows:
        print(f'  {col or "(sanadset)"}: {cnt:,}')

    db.close()
    print('\n[ReimportBengali] Done!')


if __name__ == '__main__':
    main()
