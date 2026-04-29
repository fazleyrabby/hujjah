#!/usr/bin/env python3
"""
scripts/sunnah-migration/08-import-sunnah-en.py

Import English translations from MySQL sunnahdb into hujjah-hadith-core.db.

- Dumps MySQL via subprocess (no mysql-connector dep)
- Joins on HadithTable.englishURN = hadiths.sunnah_english_urn
- Strips HTML tags from englishText
- Skips hadiths that already have a sunnah.com EN translation
- Tags translator='sunnah.com'
"""

import sqlite3
import re
import sys
import subprocess
import json

SQLITE_DB = '/Users/rabbi/Desktop/Projects/hujjah/apps/tauri/src-tauri/resources/hujjah-hadith-core.db'
MYSQL_USER = 'root'
MYSQL_DB   = 'sunnahdb'
BATCH_SIZE = 500


def strip_html(text: str) -> str:
    if not text:
        return ''
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()


def fetch_mysql_all() -> dict[int, str]:
    """Dump entire HadithTable from MySQL with newlines escaped. Returns {urn: text}."""
    # Escape newlines/tabs in SQL so each row is one output line
    query = (
        "SELECT englishURN, "
        "REPLACE(REPLACE(REPLACE(IFNULL(englishText,''), '\\\\', '\\\\\\\\'), '\\n', '\\\\n'), '\\t', ' ') "
        "FROM HadithTable"
    )
    result = subprocess.run(
        ['mysql', '-u', MYSQL_USER, '--batch', '--raw', '--skip-column-names', '-e', query, MYSQL_DB],
        capture_output=True, text=True, encoding='utf-8'
    )
    if result.returncode != 0:
        print(f'MySQL error: {result.stderr}')
        sys.exit(1)

    rows = {}
    for line in result.stdout.splitlines():
        tab_idx = line.find('\t')
        if tab_idx == -1:
            continue
        try:
            urn = int(line[:tab_idx])
            # Unescape \n back to real newlines
            text = line[tab_idx + 1:].replace('\\n', '\n').replace('\\\\', '\\')
            rows[urn] = text
        except ValueError:
            continue
    return rows


def main():
    print('[ImportSunnahEN] Starting...\n')

    sqlite_conn = sqlite3.connect(SQLITE_DB)
    sqlite_conn.execute('PRAGMA journal_mode = WAL')
    sqlite_conn.execute('PRAGMA synchronous = NORMAL')

    total_hadiths = sqlite_conn.execute('SELECT COUNT(*) FROM hadiths').fetchone()[0]
    existing = sqlite_conn.execute(
        "SELECT COUNT(*) FROM hadith_translations WHERE translator='sunnah.com' AND lang_code='en'"
    ).fetchone()[0]
    print(f'Total hadiths:              {total_hadiths:,}')
    print(f'Existing sunnah.com EN:     {existing:,}')

    # Load hadith IDs that need EN translations
    print('\n[Step 1] Building URN → hadith_id map...')
    rows = sqlite_conn.execute("""
        SELECT h.id, h.sunnah_english_urn
        FROM hadiths h
        WHERE h.sunnah_english_urn IS NOT NULL
          AND h.id NOT IN (
              SELECT hadith_id FROM hadith_translations
              WHERE lang_code = 'en' AND translator = 'sunnah.com'
          )
    """).fetchall()
    urn_to_id = {urn: hid for hid, urn in rows}
    print(f'Hadiths needing EN:         {len(urn_to_id):,}')

    if not urn_to_id:
        print('\nAll done — no missing sunnah.com EN translations.')
        sqlite_conn.close()
        return

    # Fetch from MySQL (full dump, newlines escaped)
    print('\n[Step 2] Fetching from MySQL sunnahdb...')
    mysql_data = fetch_mysql_all()
    print(f'Total fetched from MySQL:   {len(mysql_data):,}')

    # Insert into SQLite
    print('\n[Step 3] Inserting translations...')
    inserted = 0
    skipped_empty = 0
    batch = []

    for urn, text in mysql_data.items():
        hadith_id = urn_to_id.get(urn)
        if hadith_id is None:
            continue

        clean = strip_html(text)
        if not clean:
            skipped_empty += 1
            continue

        batch.append((hadith_id, 'en', clean[:5000], 'sunnah.com'))

        if len(batch) >= BATCH_SIZE:
            sqlite_conn.executemany(
                'INSERT OR IGNORE INTO hadith_translations (hadith_id, lang_code, matn_text, translator) VALUES (?, ?, ?, ?)',
                batch
            )
            sqlite_conn.commit()
            inserted += len(batch)
            print(f'  ...{inserted:,} inserted')
            batch = []

    if batch:
        sqlite_conn.executemany(
            'INSERT OR IGNORE INTO hadith_translations (hadith_id, lang_code, matn_text, translator) VALUES (?, ?, ?, ?)',
            batch
        )
        sqlite_conn.commit()
        inserted += len(batch)

    print(f'\n[Done]')
    print(f'  Inserted:      {inserted:,}')
    print(f'  Skipped empty: {skipped_empty:,}')
    print(f'  No URN match:  {len(mysql_data) - inserted - skipped_empty:,}')

    # Final coverage
    total_en = sqlite_conn.execute(
        "SELECT COUNT(DISTINCT hadith_id) FROM hadith_translations WHERE lang_code='en'"
    ).fetchone()[0]
    sunnah_en = sqlite_conn.execute(
        "SELECT COUNT(*) FROM hadith_translations WHERE translator='sunnah.com' AND lang_code='en'"
    ).fetchone()[0]
    print(f'\nFinal EN coverage:          {total_en:,} / {total_hadiths:,}')
    print(f'sunnah.com EN translations: {sunnah_en:,}')

    sqlite_conn.close()


if __name__ == '__main__':
    main()
