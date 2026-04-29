#!/usr/bin/env python3
"""
scripts/sunnah-migration/11-fetch-sunnah-chains.py

Fetch narrator chains from sunnah.com API for all 42,694 hadiths.
Replaces sanadset narrator data with sunnah.com structured chains.

Rate limit: 5 req/sec, 5,000/day → run over multiple days or request increase.
Progress is saved — safe to interrupt and resume.

Usage:
  export SUNNAH_API_KEY=your_key_here
  python3 11-fetch-sunnah-chains.py [--dry-run] [--limit 100]
"""

import argparse
import re
import sqlite3
import sys
import time
import urllib.request
import urllib.error
import json
import os

SQLITE_DB = '/Users/rabbi/Desktop/Projects/hujjah/apps/tauri/src-tauri/resources/hujjah-hadith-core.db'
API_BASE  = 'https://api.sunnah.com/v1'
RATE_LIMIT = 4.5   # req/sec (stay under 5)
DAILY_CAP  = 4700  # stay under 5,000/day

# sunnah_collection slug → API collection name
COLLECTION_MAP = {
    'bukhari':        'bukhari',
    'muslim':         'muslim',
    'abudawud':       'abudawud',
    'ibnmajah':       'ibnmajah',
    'tirmidhi':       'tirmidhi',
    'nasai':          'nasai',
    'ahmad':          'ahmad',
    'mishkat':        'mishkat',
    'riyadussalihin': 'riyadussalihin',
    'adab':           'adab',
    'shamail':        'shamail',
    'bulugh':         'bulugh',
    'hisn':           'hisn',
    'forty':          'forty',
}

NARRATOR_RE = re.compile(
    r'\[narrator\s+id="(\d+)"\s+tooltip="([^"]+)"\]',
    re.UNICODE
)


def get_api_key() -> str:
    key = os.environ.get('SUNNAH_API_KEY', '').strip()
    if not key:
        print('ERROR: Set SUNNAH_API_KEY environment variable.')
        print('  export SUNNAH_API_KEY=your_key_here')
        sys.exit(1)
    return key


def fetch_hadith(collection: str, hadith_num: str, api_key: str) -> list[tuple[int, str]]:
    """
    Fetch a hadith from API. Returns list of (narrator_id, narrator_name_ar) in chain order.
    """
    url = f'{API_BASE}/collections/{collection}/hadiths/{hadith_num}'
    req = urllib.request.Request(url, headers={'X-API-Key': api_key})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None  # hadith not found
        raise

    for h in data.get('hadith', []):
        if h.get('lang') == 'ar':
            body = h.get('body', '')
            return [(int(m.group(1)), m.group(2)) for m in NARRATOR_RE.finditer(body)]
    return []


def setup_tables(db: sqlite3.Connection):
    """Create/verify required tables."""
    db.executescript("""
        CREATE TABLE IF NOT EXISTS narrator_fetch_progress (
            hadith_id INTEGER PRIMARY KEY,
            fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)
    db.commit()


def clear_sanadset_data(db: sqlite3.Connection):
    """Replace sanadset narrator data with clean slate for sunnah.com chains."""
    print('[Setup] Clearing sanadset narrator data...')

    # Clear all hadith_narrators (orphans from old sanadset IDs + any existing)
    db.execute('DELETE FROM hadith_narrators')
    hn_deleted = db.total_changes

    db.execute('DELETE FROM narrator_edges')
    ne_deleted = db.total_changes

    db.commit()
    print(f'  hadith_narrators rows deleted (sanadset): {hn_deleted:,}')
    print(f'  narrator_edges cleared: {ne_deleted:,}')


def get_pending(db: sqlite3.Connection) -> list[tuple[int, str, str]]:
    """Return (hadith_id, collection, hadith_number) for unfetched sunnah.com hadiths."""
    rows = db.execute("""
        SELECT h.id, h.sunnah_collection, h.sunnah_hadith_number
        FROM hadiths h
        WHERE h.source = 'sunnah.com'
          AND h.sunnah_collection IS NOT NULL
          AND h.sunnah_hadith_number IS NOT NULL
          AND h.id NOT IN (SELECT hadith_id FROM narrator_fetch_progress)
        ORDER BY h.sunnah_collection, CAST(h.sunnah_hadith_number AS REAL)
    """).fetchall()
    return rows


def upsert_narrator(db: sqlite3.Connection, sunnah_id: int, name_ar: str) -> int:
    """Insert narrator if not exists. Return internal narrator_id."""
    existing = db.execute(
        'SELECT id FROM narrators WHERE sunnah_narrator_id = ?', (sunnah_id,)
    ).fetchone()
    if existing:
        return existing[0]

    # Try match by name_ar (first part of full nasab)
    short_name = name_ar.split(' بن ')[0].strip() if ' بن ' in name_ar else name_ar[:40]
    existing_by_name = db.execute(
        'SELECT id FROM narrators WHERE name_ar = ?', (name_ar,)
    ).fetchone()
    if existing_by_name:
        db.execute('UPDATE narrators SET sunnah_narrator_id = ? WHERE id = ?',
                   (sunnah_id, existing_by_name[0]))
        return existing_by_name[0]

    db.execute(
        'INSERT INTO narrators (name_ar, sunnah_narrator_id, data_source) VALUES (?, ?, "sunnah.com")',
        (name_ar, sunnah_id)
    )
    return db.execute('SELECT last_insert_rowid()').fetchone()[0]


def store_chain(db: sqlite3.Connection, hadith_id: int, chain: list[tuple[int, str]]):
    """Store per-hadith narrator chain and update edges aggregate."""
    if not chain:
        return

    internal_ids = []
    for sunnah_id, name_ar in chain:
        internal_id = upsert_narrator(db, sunnah_id, name_ar)
        internal_ids.append(internal_id)

    # hadith_narrators: (hadith_id, narrator_id, position)
    db.executemany(
        'INSERT OR IGNORE INTO hadith_narrators (hadith_id, narrator_id, position) VALUES (?,?,?)',
        [(hadith_id, nid, pos) for pos, nid in enumerate(internal_ids)]
    )

    # narrator_edges: from→to pairs (adjacent in chain)
    for i in range(len(internal_ids) - 1):
        frm, to = internal_ids[i], internal_ids[i + 1]
        db.execute("""
            INSERT INTO narrator_edges (from_narrator_id, to_narrator_id, hadith_count)
            VALUES (?, ?, 1)
            ON CONFLICT(from_narrator_id, to_narrator_id)
            DO UPDATE SET hadith_count = hadith_count + 1
        """, (frm, to))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--limit', type=int, default=0, help='Max hadiths to fetch this run')
    parser.add_argument('--clear', action='store_true', help='Clear sanadset data before starting')
    args = parser.parse_args()

    api_key = get_api_key()

    db = sqlite3.connect(SQLITE_DB)
    db.execute('PRAGMA journal_mode = WAL')
    db.execute('PRAGMA synchronous = NORMAL')

    setup_tables(db)

    if args.clear:
        clear_sanadset_data(db)

    pending = get_pending(db)
    if args.limit:
        pending = pending[:args.limit]

    total = len(pending)
    already_done = db.execute('SELECT COUNT(*) FROM narrator_fetch_progress').fetchone()[0]
    print(f'\n[State]')
    print(f'  Already fetched:  {already_done:,}')
    print(f'  Pending this run: {total:,}')
    print(f'  Daily cap:        {DAILY_CAP:,}')

    if total == 0:
        print('\nAll done!')
        db.close()
        return

    if total > DAILY_CAP:
        print(f'\nNOTE: {total:,} pending but daily cap is {DAILY_CAP:,}.')
        print(f'      Will fetch {DAILY_CAP:,} today. Re-run tomorrow for the rest.')
        pending = pending[:DAILY_CAP]

    if args.dry_run:
        print(f'\nDry run — would fetch {len(pending):,} hadiths. Exiting.')
        db.close()
        return

    interval = 1.0 / RATE_LIMIT
    fetched = 0
    chains_stored = 0
    errors = 0
    batch_size = 100

    print(f'\n[Fetching] Starting at {RATE_LIMIT} req/sec...\n')
    t_start = time.time()

    for i, (hadith_id, collection, hadith_num) in enumerate(pending):
        api_collection = COLLECTION_MAP.get(collection, collection)

        t0 = time.time()
        try:
            chain = fetch_hadith(api_collection, hadith_num, api_key)
        except Exception as e:
            print(f'  ERROR {collection}:{hadith_num} — {e}')
            errors += 1
            time.sleep(1)
            continue

        if chain is not None:
            store_chain(db, hadith_id, chain)
            if chain:
                chains_stored += 1

        db.execute('INSERT OR IGNORE INTO narrator_fetch_progress (hadith_id) VALUES (?)', (hadith_id,))
        fetched += 1

        # Commit every batch
        if fetched % batch_size == 0:
            db.commit()
            elapsed = time.time() - t_start
            rate = fetched / elapsed
            eta_min = (len(pending) - fetched) / rate / 60 if rate > 0 else 0
            print(f'  {fetched:,}/{len(pending):,} fetched | {chains_stored:,} chains | {rate:.1f} req/s | ETA {eta_min:.0f}m')

        # Rate limiting
        elapsed = time.time() - t0
        wait = interval - elapsed
        if wait > 0:
            time.sleep(wait)

    db.commit()
    db.close()

    print(f'\n[Done]')
    print(f'  Fetched:       {fetched:,}')
    print(f'  Chains stored: {chains_stored:,}')
    print(f'  Errors:        {errors:,}')
    print(f'  Remaining:     {total - fetched:,} (run again tomorrow)')


if __name__ == '__main__':
    main()
