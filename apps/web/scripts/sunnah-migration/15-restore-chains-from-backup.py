#!/usr/bin/env python3
"""
scripts/sunnah-migration/15-restore-chains-from-backup.py

Restore narrator chains for Kutub al-Sittah sunnah.com hadiths from backup DB.

Priority: sunnah.com text (authenticity), chains from backup core DB.

Usage:
  python3 15-restore-chains-from-backup.py [--dry-run] [--collections bukhari,muslim,...]

Snapshot saved at: /Volumes/1TB SSD/HujjahDB/snapshots/2026-04-30_163545/
"""

import argparse
import sqlite3
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent

# Paths
SUNNAH_DB = '/Users/rabbi/Desktop/Projects/hujjah/apps/tauri/src-tauri/resources/hujjah-hadith-core.db'
BACKUP_DB = '/Users/rabbi/Desktop/HujjahBackup/hujjah-hadith-core.db'

# Kutub al-Sittah book_ids (same in both DBs)
KUTUB_AL_SITTAH = {
    1688: 'bukhari',
    1689: 'muslim',
    1648: 'abudawud',
    1652: 'ibnmajah',
    1444: 'tirmidhi',
    # nasai excluded: sunnah.com has Sunan Sughra, backup has Sunan Kubra (different)
}


def connect(path: str) -> sqlite3.Connection:
    db = sqlite3.connect(path)
    db.execute('PRAGMA journal_mode = WAL')
    db.execute('PRAGMA foreign_keys = ON')
    return db


def get_narrator_id(backup_narrator_id: int, backup_name_ar: str, sunnah_conn: sqlite3.Connection, backup_conn: sqlite3.Connection) -> int:
    """
    Map backup narrator to sunnah DB narrator.
    1. Try existing narrator in sunnah DB by name_ar match
    2. Insert new narrator with backup's sunnah_narrator_id if available
    Returns sunnah DB narrator id.
    """
    # Check if narrator already exists in sunnah DB by name
    existing = sunnah_conn.execute(
        'SELECT id FROM narrators WHERE name_ar = ?', (backup_name_ar,)
    ).fetchone()
    if existing:
        return existing[0]

    # Check if already linked via sunnah_narrator_id
    sunnah_narrator_id = backup_conn.execute(
        'SELECT sunnah_narrator_id FROM narrators WHERE id = ?',
        (backup_narrator_id,)
    ).fetchone()
    if sunnah_narrator_id and sunnah_narrator_id[0]:
        existing_by_sunnah = sunnah_conn.execute(
            'SELECT id FROM narrators WHERE sunnah_narrator_id = ?',
            (sunnah_narrator_id[0],)
        ).fetchone()
        if existing_by_sunnah:
            return existing_by_sunnah[0]

    # Insert new narrator
    # Get additional data from backup if available
    extra = backup_conn.execute("""
        SELECT birth_year, death_year, city, reliability
        FROM narrators WHERE id = ?
    """, (backup_narrator_id,)).fetchone()

    data_source = 'backup.core'
    sunnah_narrator_id_val = sunnah_narrator_id[0] if sunnah_narrator_id else None

    sunnah_conn.execute("""
        INSERT INTO narrators (name_ar, sunnah_narrator_id, data_source)
        VALUES (?, ?, ?)
    """, (backup_name_ar, sunnah_narrator_id_val, data_source))

    return sunnah_conn.execute('SELECT last_insert_rowid()').fetchone()[0]


def restore_chains(sunnah_conn: sqlite3.Connection, backup_conn: sqlite3.Connection,
                   collections: list[str], dry_run: bool):
    """Main restoration logic."""

    collection_filter = [KUTUB_AL_SITTAH[bid] for bid in KUTUB_AL_SITTAH] if not collections else collections

    print(f'[Restore] Starting chain restoration')
    print(f'  sunnah DB: {SUNNAH_DB}')
    print(f'  backup DB: {BACKUP_DB}')
    print(f'  collections: {", ".join(collection_filter) if collection_filter else "all Kutub al-Sittah"}')
    print(f'  dry run: {dry_run}')
    print()

    # Stats
    stats = {
        'hadiths_processed': 0,
        'hadiths_matched': 0,
        'hadiths_chain_restored': 0,
        'narrators_created': 0,
        'narrator_links': 0,
        'edges_created': 0,
    }

    # Collect all narrator edges to batch-insert
    edges_batch = []  # (from_id, to_id)

    for book_id, coll_name in KUTUB_AL_SITTAH.items():
        if collection_filter and coll_name not in collection_filter:
            continue

        print(f'[{coll_name}] Processing...')

        # Get all sunnah.com hadiths for this collection
        sunnah_hadiths = sunnah_conn.execute("""
            SELECT id, sunnah_hadith_number
            FROM hadiths
            WHERE source = 'sunnah.com' AND sunnah_collection = ? AND book_id = ?
        """, (coll_name, book_id)).fetchall()

        stats['hadiths_processed'] += len(sunnah_hadiths)

        for sunnah_hid, sunnah_num in sunnah_hadiths:
            # Parse sunnah_num (handle "103 a", "104 b" etc)
            try:
                if sunnah_num is None:
                    continue
                sunnah_num_str = str(sunnah_num).strip()
                if not sunnah_num_str:
                    continue
                match_num = int(float(sunnah_num_str.split()[0]))
            except (ValueError, TypeError, IndexError):
                continue

            # Find matching backup hadith
            backup_hid = backup_conn.execute("""
                SELECT id FROM hadiths WHERE book_id = ? AND num_in_book = ?
            """, (book_id, match_num)).fetchone()

            if not backup_hid:
                continue

            stats['hadiths_matched'] += 1
            backup_hid = backup_hid[0]

            # Get narrator chain from backup
            chain = backup_conn.execute("""
                SELECT hn.narrator_id, hn.position, n.name_ar
                FROM hadith_narrators hn
                JOIN narrators n ON n.id = hn.narrator_id
                WHERE hn.hadith_id = ?
                ORDER BY hn.position
            """, (backup_hid,)).fetchall()

            if not chain:
                continue

            stats['hadiths_chain_restored'] += 1

            if dry_run:
                continue

            # Map backup narrator IDs to sunnah DB narrator IDs
            mapped_ids = []
            for backup_nar_id, position, backup_name_ar in chain:
                nar_id = get_narrator_id(backup_nar_id, backup_name_ar, sunnah_conn, backup_conn)
                mapped_ids.append(nar_id)

                # Check if this is a new narrator
                existing = sunnah_conn.execute(
                    'SELECT id FROM narrators WHERE name_ar = ?', (backup_name_ar,)
                ).fetchone()
                if not existing or existing[0] != nar_id:
                    stats['narrators_created'] += 1

            # Insert hadith_narrators
            for pos, nar_id in enumerate(mapped_ids):
                sunnah_conn.execute("""
                    INSERT OR IGNORE INTO hadith_narrators (hadith_id, narrator_id, position)
                    VALUES (?, ?, ?)
                """, (sunnah_hid, nar_id, pos))
                stats['narrator_links'] += 1

            # Build edges from chain sequence
            for i in range(len(mapped_ids) - 1):
                from_id, to_id = mapped_ids[i], mapped_ids[i + 1]
                edges_batch.append((from_id, to_id))

        print(f'  processed: {stats["hadiths_processed"]}, matched: {stats["hadiths_matched"]}, '
              f'chain_restored: {stats["hadiths_chain_restored"]}')

    if dry_run:
        print(f'\n[DRY RUN] Would restore {stats["hadiths_chain_restored"]} chains')
        print(f'  narrators_created: ~{stats["narrators_created"]}')
        print(f'  narrator_links: ~{stats["narrator_links"]}')
        print(f'  edges: ~{stats["edges_created"]}')
        return stats

    # Batch insert edges
    print(f'\n[Edges] Inserting {len(edges_batch)} narrator edges...')
    for from_id, to_id in edges_batch:
        sunnah_conn.execute("""
            INSERT INTO narrator_edges (from_narrator_id, to_narrator_id, hadith_count)
            VALUES (?, ?, 1)
            ON CONFLICT(from_narrator_id, to_narrator_id)
            DO UPDATE SET hadith_count = hadith_count + 1
        """, (from_id, to_id))

    stats['edges_created'] = len(edges_batch)
    sunnah_conn.commit()

    print(f'\n[Done] Chain restoration complete')
    print(f'  hadiths_processed: {stats["hadiths_processed"]}')
    print(f'  hadiths_matched: {stats["hadiths_matched"]}')
    print(f'  hadiths_chain_restored: {stats["hadiths_chain_restored"]}')
    print(f'  narrators_created: {stats["narrators_created"]}')
    print(f'  narrator_links: {stats["narrator_links"]}')
    print(f'  edges_created: {stats["edges_created"]}')

    return stats


def main():
    parser = argparse.ArgumentParser(description='Restore narrator chains from backup DB')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without making changes')
    parser.add_argument('--collections', type=str, default='',
                        help='Comma-separated list: bukhari,muslim,abudawud,ibnmajah,tirmidhi')
    args = parser.parse_args()

    collections = [c.strip() for c in args.collections.split(',') if c.strip()] if args.collections else []

    sunnah_conn = connect(SUNNAH_DB)
    backup_conn = connect(BACKUP_DB)

    try:
        restore_chains(sunnah_conn, backup_conn, collections, args.dry_run)
    finally:
        sunnah_conn.close()
        backup_conn.close()


if __name__ == '__main__':
    main()
