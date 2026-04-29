#!/usr/bin/env python3
"""
scripts/quran/01-import-tafsir.py

Import tafsir from quran.com API into hujjah-quran.db.

Available tafsirs (quran.com IDs):
  EN: 169 = Ibn Kathir (Abridged), 168 = Ma'arif al-Qur'an
  BN: 164 = Ibn Kathir BN, 165 = Ahsanul Bayaan, 166 = Abu Bakr Zakaria, 381 = Fathul Majid
  AR: 14 = Ibn Kathir AR, 15 = Tabari, 16 = Muyassar

Rate: ~10 req/sec (quran.com is generous, no stated limit)
Progress: resumable — skips already imported verses

Usage:
  python3 01-import-tafsir.py --tafsir 169               # Ibn Kathir EN
  python3 01-import-tafsir.py --tafsir 166               # Abu Bakr Zakaria BN
  python3 01-import-tafsir.py --tafsir 169 168 166 164   # multiple
  python3 01-import-tafsir.py --all                      # all default tafsirs
  python3 01-import-tafsir.py --list                     # show available tafsirs
"""

import argparse
import json
import re
import sqlite3
import sys
import time
import urllib.request
import urllib.error

SQLITE_DB  = '/Users/rabbi/Desktop/Projects/hujjah/apps/tauri/src-tauri/resources/hujjah-quran.db'
API_BASE   = 'https://api.quran.com/api/v4'
RATE_LIMIT = 8.0   # req/sec
BATCH_SIZE = 100
TIMEOUT    = 15

# Default tafsirs to import
DEFAULT_TAFSIRS = {
    169: ('en-ibn-kathir',      'en'),
    166: ('bn-abu-bakr-zakaria','bn'),
    164: ('bn-ibn-kathir',      'bn'),
}

ALL_TAFSIRS = {
    169: ('en-ibn-kathir',       'en'),
    168: ('en-maariful-quran',   'en'),
    164: ('bn-ibn-kathir',       'bn'),
    165: ('bn-ahsanul-bayaan',   'bn'),
    166: ('bn-abu-bakr-zakaria', 'bn'),
    381: ('bn-fathul-majid',     'bn'),
    14:  ('ar-ibn-kathir',       'ar'),
    15:  ('ar-tabari',           'ar'),
    16:  ('ar-muyassar',         'ar'),
}


def strip_html(text: str) -> str:
    if not text:
        return ''
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def fetch_tafsir_verse(tafsir_id: int, surah: int, ayah: int) -> str | None:
    url = f'{API_BASE}/tafsirs/{tafsir_id}/by_ayah/{surah}:{ayah}'
    req = urllib.request.Request(url, headers={
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; Hujjah/1.0)',
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = json.load(r)
        text = data.get('tafsir', {}).get('text', '')
        return strip_html(text) if text else None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def get_all_verses(db: sqlite3.Connection) -> list[tuple[int, int, int]]:
    """Return (verse_id, surah, ayah) for all verses."""
    return db.execute('SELECT id, surah, ayah FROM verses ORDER BY surah, ayah').fetchall()


def get_pending(db: sqlite3.Connection, slug: str, all_verses: list) -> list[tuple[int, int, int]]:
    """Return verses not yet imported for this tafsir slug."""
    done = set(row[0] for row in db.execute(
        'SELECT verse_id FROM tafsir WHERE tafsir_slug = ?', (slug,)
    ).fetchall())
    return [(vid, s, a) for vid, s, a in all_verses if vid not in done]


def import_tafsir(db: sqlite3.Connection, tafsir_id: int, slug: str, lang: str):
    all_verses = get_all_verses(db)
    pending = get_pending(db, slug, all_verses)
    total = len(pending)

    print(f'\n[{slug}] id={tafsir_id} lang={lang}')
    print(f'  Total verses: {len(all_verses):,} | Already done: {len(all_verses)-total:,} | Pending: {total:,}')

    if total == 0:
        print('  Nothing to do.')
        return

    interval = 1.0 / RATE_LIMIT
    inserted = 0
    not_found = 0
    errors = 0
    batch = []

    for i, (verse_id, surah, ayah) in enumerate(pending):
        t0 = time.time()

        try:
            text = fetch_tafsir_verse(tafsir_id, surah, ayah)
        except Exception as e:
            print(f'  ERROR {surah}:{ayah} — {e}')
            errors += 1
            time.sleep(2)
            continue

        if text:
            batch.append((verse_id, slug, lang, text[:10000]))
        else:
            not_found += 1

        if len(batch) >= BATCH_SIZE:
            db.executemany(
                'INSERT OR IGNORE INTO tafsir (verse_id, tafsir_slug, lang_code, text) VALUES (?,?,?,?)',
                batch
            )
            db.commit()
            inserted += len(batch)
            batch = []
            pct = (i + 1) / total * 100
            print(f'  {i+1:,}/{total:,} ({pct:.0f}%) | inserted={inserted:,} not_found={not_found:,} errors={errors:,}')

        elapsed = time.time() - t0
        wait = interval - elapsed
        if wait > 0:
            time.sleep(wait)

    if batch:
        db.executemany(
            'INSERT OR IGNORE INTO tafsir (verse_id, tafsir_slug, lang_code, text) VALUES (?,?,?,?)',
            batch
        )
        db.commit()
        inserted += len(batch)

    print(f'\n  [Done] inserted={inserted:,} not_found={not_found:,} errors={errors:,}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tafsir', type=int, nargs='+', help='Tafsir ID(s) to import')
    parser.add_argument('--all', action='store_true', help='Import all tafsirs')
    parser.add_argument('--list', action='store_true', help='List available tafsirs')
    args = parser.parse_args()

    if args.list:
        print('\nAvailable tafsirs:')
        for tid, (slug, lang) in ALL_TAFSIRS.items():
            default = ' *' if tid in DEFAULT_TAFSIRS else ''
            print(f'  {tid:4d} | {slug:<30} | {lang}{default}')
        print('\n* = included in --all default set')
        return

    if not args.tafsir and not args.all:
        parser.print_help()
        sys.exit(1)

    if args.all:
        to_import = DEFAULT_TAFSIRS
    else:
        to_import = {tid: ALL_TAFSIRS[tid] for tid in args.tafsir if tid in ALL_TAFSIRS}
        unknown = [tid for tid in args.tafsir if tid not in ALL_TAFSIRS]
        if unknown:
            print(f'Unknown tafsir IDs: {unknown}. Run --list to see available.')
            sys.exit(1)

    db = sqlite3.connect(SQLITE_DB)
    db.execute('PRAGMA journal_mode = WAL')
    db.execute('PRAGMA synchronous = NORMAL')

    for tafsir_id, (slug, lang) in to_import.items():
        import_tafsir(db, tafsir_id, slug, lang)

    db.close()
    print('\n[All done]')

    # Final coverage
    db2 = sqlite3.connect(SQLITE_DB)
    rows = db2.execute('SELECT tafsir_slug, lang_code, COUNT(*) FROM tafsir GROUP BY tafsir_slug').fetchall()
    print('\n[Coverage]')
    for slug, lang, cnt in rows:
        print(f'  {slug} ({lang}): {cnt:,}')
    db2.close()


if __name__ == '__main__':
    main()
