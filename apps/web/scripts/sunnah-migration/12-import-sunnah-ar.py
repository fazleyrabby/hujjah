#!/usr/bin/env python3
"""
scripts/sunnah-migration/12-import-sunnah-ar.py

Import Arabic text from MySQL sunnahdb into hadiths.matn_ar for sunnah.com hadiths.

- Joins on HadithTable.arabicURN = hadiths.sunnah_arabic_urn
- Strips narrator tags and HTML, stores clean Arabic matn
- Skips hadiths that already have matn_ar

Usage: python3 12-import-sunnah-ar.py
"""

import sqlite3
import re
import subprocess
import sys

SQLITE_DB  = '/Users/rabbi/Desktop/Projects/hujjah/apps/tauri/src-tauri/resources/hujjah-hadith-core.db'
MYSQL_USER = 'root'
MYSQL_DB   = 'sunnahdb'
BATCH_SIZE = 500

# Strips [prematn]...[/prematn] block (narrator chain) keeping only matn
PREMATN_RE  = re.compile(r'\[prematn\].*?\[/prematn\]', re.DOTALL)
MATN_TAG_RE = re.compile(r'\[/?matn\]')
NARRATOR_RE = re.compile(r'\[narrator[^\]]*\]|\[/narrator\]')
HTML_RE     = re.compile(r'<[^>]+>')


def clean_arabic(text: str) -> str:
    if not text:
        return ''
    text = PREMATN_RE.sub('', text)       # remove sanad block
    text = MATN_TAG_RE.sub('', text)      # remove [matn]/[/matn]
    text = NARRATOR_RE.sub('', text)      # remove stray narrator tags
    text = HTML_RE.sub('', text)          # remove HTML
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def fetch_mysql() -> dict[int, str]:
    """Dump arabicURN + arabicText from MySQL. Returns {urn: clean_text}."""
    query = (
        "SELECT arabicURN, "
        "REPLACE(REPLACE(REPLACE(IFNULL(arabicText,''), '\\\\', '\\\\\\\\'), '\\n', '\\\\n'), '\\t', ' ') "
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
        tab = line.find('\t')
        if tab == -1:
            continue
        try:
            urn  = int(line[:tab])
            text = line[tab + 1:].replace('\\n', '\n').replace('\\\\', '\\')
            clean = clean_arabic(text)
            if clean:
                rows[urn] = clean
        except ValueError:
            continue
    return rows


def main():
    print('[ImportSunnahAR] Starting...\n')

    db = sqlite3.connect(SQLITE_DB)
    db.execute('PRAGMA journal_mode = WAL')
    db.execute('PRAGMA synchronous = NORMAL')

    total = db.execute('SELECT COUNT(*) FROM hadiths').fetchone()[0]
    already = db.execute("SELECT COUNT(*) FROM hadiths WHERE matn_ar IS NOT NULL AND matn_ar != ''").fetchone()[0]
    print(f'Total hadiths:      {total:,}')
    print(f'Already have AR:    {already:,}')

    # Build URN → hadith_id map for hadiths missing matn_ar
    print('\n[Step 1] Building URN map...')
    rows = db.execute("""
        SELECT id, sunnah_arabic_urn FROM hadiths
        WHERE sunnah_arabic_urn IS NOT NULL
          AND (matn_ar IS NULL OR matn_ar = '')
    """).fetchall()
    urn_map = {urn: hid for hid, urn in rows}
    print(f'Hadiths needing AR: {len(urn_map):,}')

    if not urn_map:
        print('\nAll done.')
        db.close()
        return

    # Fetch from MySQL
    print('\n[Step 2] Fetching from MySQL...')
    mysql_data = fetch_mysql()
    print(f'MySQL rows fetched:  {len(mysql_data):,}')

    # Update hadiths.matn_ar
    print('\n[Step 3] Updating matn_ar...')
    updated = 0
    skipped_empty = 0
    batch = []

    for urn, text in mysql_data.items():
        hadith_id = urn_map.get(urn)
        if hadith_id is None:
            continue
        if not text:
            skipped_empty += 1
            continue
        batch.append((text[:5000], hadith_id))

        if len(batch) >= BATCH_SIZE:
            db.executemany('UPDATE hadiths SET matn_ar = ? WHERE id = ?', batch)
            db.commit()
            updated += len(batch)
            print(f'  ...{updated:,} updated')
            batch = []

    if batch:
        db.executemany('UPDATE hadiths SET matn_ar = ? WHERE id = ?', batch)
        db.commit()
        updated += len(batch)

    print(f'\n[Done]')
    print(f'  Updated:       {updated:,}')
    print(f'  Skipped empty: {skipped_empty:,}')

    final = db.execute("SELECT COUNT(*) FROM hadiths WHERE matn_ar IS NOT NULL AND matn_ar != ''").fetchone()[0]
    print(f'  Total with AR: {final:,} / {total:,}')

    db.close()


if __name__ == '__main__':
    main()
