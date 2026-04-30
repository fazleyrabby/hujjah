#!/usr/bin/env python3
"""
scripts/sunnah-migration/16-restore-subdivision-chains.py

Map letter subdivisions (901a, 901b, etc.) to their base hadith's chain.

ONLY inserts into hadith_narrators and narrator_edges.
NEVER modifies hadiths, hadith_translations, or any text data.

Usage:
  python3 16-restore-subdivision-chains.py --dry-run
"""

import argparse
import re
import sqlite3
import sys
from pathlib import Path

SUNNAH_DB = '/Users/rabbi/Desktop/Projects/hujjah/apps/tauri/src-tauri/resources/hujjah-hadith-core.db'
BACKUP_DB = '/Users/rabbi/Desktop/HujjahBackup/hujjah-hadith-core.db'

LETTER_RE = re.compile(r'^(\d+)\s*[abcABC]$', re.IGNORECASE)

KUTUB_AL_SITTAH = {
    1688: 'bukhari',
    1689: 'muslim',
    1648: 'abudawud',
    1652: 'ibnmajah',
    1444: 'tirmidhi',
}


def connect(path: str) -> sqlite3.Connection:
    db = sqlite3.connect(path)
    db.execute('PRAGMA journal_mode = WAL')
    db.execute('PRAGMA foreign_keys = ON')
    return db


def restore_subdivision_chains(sunnah_conn: sqlite3.Connection, backup_conn: sqlite3.Connection, dry_run: bool):
    """
    For sunnah.com hadiths with letter subdivisions (901a, 901b, etc.),
    map to the base hadith's chain from backup.

    Only touches: hadith_narrators, narrator_edges
    Never touches: hadiths, hadith_translations, or any text data.
    """

    print('[Subdivisions] Mapping letter subdivisions to base hadith chains')
    print(f'  sunnah DB: {SUNNAH_DB}')
    print(f'  backup DB: {BACKUP_DB}')
    print(f'  dry run: {dry_run}')
    print()

    stats = {
        'subdivisions_found': 0,
        'subdivisions_mapped': 0,
        'hadiths_with_chain': 0,
        'narrator_links': 0,
        'edges': 0,
    }

    edges_batch = []

    for book_id, coll_name in KUTUB_AL_SITTAH.items():
        print(f'[{coll_name}]')

        # Get all sunnah.com hadiths for this collection
        sunnah_hadiths = sunnah_conn.execute("""
            SELECT id, sunnah_hadith_number
            FROM hadiths
            WHERE source = 'sunnah.com' AND book_id = ?
        """, (book_id,)).fetchall()

        for sunnah_hid, sunnah_num in sunnah_hadiths:
            if sunnah_num is None:
                continue

            sn = str(sunnah_num).strip()
            m = LETTER_RE.match(sn)
            if not m:
                continue

            stats['subdivisions_found'] += 1
            base_num = int(m.group(1))

            # Find base hadith in backup
            backup_hid = backup_conn.execute("""
                SELECT id FROM hadiths WHERE book_id = ? AND num_in_book = ?
            """, (book_id, base_num)).fetchone()

            if not backup_hid:
                continue

            backup_hid = backup_hid[0]

            # Check if base hadith has chains in backup
            chain = backup_conn.execute("""
                SELECT hn.narrator_id, hn.position, n.name_ar
                FROM hadith_narrators hn
                JOIN narrators n ON n.id = hn.narrator_id
                WHERE hn.hadith_id = ?
                ORDER BY hn.position
            """, (backup_hid,)).fetchall()

            if not chain:
                continue

            stats['subdivisions_mapped'] += 1

            if dry_run:
                continue

            # Map narrators (reuse same logic as main restore script)
            mapped_ids = []
            for backup_nar_id, position, backup_name_ar in chain:
                # Try find existing narrator in sunnah DB by name
                existing = sunnah_conn.execute(
                    'SELECT id FROM narrators WHERE name_ar = ?', (backup_name_ar,)
                ).fetchone()
                if existing:
                    nar_id = existing[0]
                else:
                    # Insert new
                    sunnah_narrator_id = backup_conn.execute(
                        'SELECT sunnah_narrator_id FROM narrators WHERE id = ?',
                        (backup_nar_id,)
                    ).fetchone()
                    sunnah_narrator_id_val = sunnah_narrator_id[0] if sunnah_narrator_id and sunnah_narrator_id[0] else None

                    sunnah_conn.execute("""
                        INSERT INTO narrators (name_ar, sunnah_narrator_id, data_source)
                        VALUES (?, ?, 'backup.core')
                    """, (backup_name_ar, sunnah_narrator_id_val))
                    nar_id = sunnah_conn.execute('SELECT last_insert_rowid()').fetchone()[0]

                mapped_ids.append(nar_id)

            # Insert hadith_narrators for this subdivision
            for pos, nar_id in enumerate(mapped_ids):
                sunnah_conn.execute("""
                    INSERT OR IGNORE INTO hadith_narrators (hadith_id, narrator_id, position)
                    VALUES (?, ?, ?)
                """, (sunnah_hid, nar_id, pos))
                stats['narrator_links'] += 1

            stats['hadiths_with_chain'] += 1

            # Build edges
            for i in range(len(mapped_ids) - 1):
                edges_batch.append((mapped_ids[i], mapped_ids[i + 1]))

        print(f'  subdivisions: {stats["subdivisions_found"]}, mapped: {stats["subdivisions_mapped"]}')

    if dry_run:
        print(f'\n[DRY RUN] Would map {stats["subdivisions_mapped"]} subdivisions')
        print(f'  narrator_links: ~{stats["narrator_links"]}')
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

    stats['edges'] = len(edges_batch)
    sunnah_conn.commit()

    print(f'\n[Done] Subdivision chains mapped')
    print(f'  subdivisions_found: {stats["subdivisions_found"]}')
    print(f'  subdivisions_mapped: {stats["subdivisions_mapped"]}')
    print(f'  hadiths_with_chain: {stats["hadiths_with_chain"]}')
    print(f'  narrator_links: {stats["narrator_links"]}')
    print(f'  edges: {stats["edges"]}')

    return stats


def main():
    parser = argparse.ArgumentParser(description='Map subdivision chains from backup')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    sunnah_conn = connect(SUNNAH_DB)
    backup_conn = connect(BACKUP_DB)

    try:
        restore_subdivision_chains(sunnah_conn, backup_conn, args.dry_run)
    finally:
        sunnah_conn.close()
        backup_conn.close()


if __name__ == '__main__':
    main()
