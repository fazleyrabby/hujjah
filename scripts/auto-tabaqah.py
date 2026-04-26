#!/usr/bin/env python3
"""
scripts/auto-tabaqah.py

Computes tabaqah (generation) for all narrators based on their relative
position in sanad chains. Works as a fallback for narrators without
biographical data.

Methodology:
- For each narrator, compute avg relative position = avg(position / chain_length)
  across all their hadiths.
- Narrators at end of chain (closest to Prophet, relative_pos >= 0.75) -> tabaqah 1
- 0.50-0.75 -> tabaqah 2
- 0.25-0.50 -> tabaqah 3
- < 0.25 -> tabaqah 4
- Only applies where tabaqah IS NULL. Marks data_source = 'computed'.
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "src-tauri/resources/hujjah-hadith-core.db"

# Tabaqah thresholds based on relative position in chain
# Higher relative_pos = closer to Prophet (end of chain in DB ordering)
TABAQAH_THRESHOLDS = [
    (0.75, 1),  # Sahaba (closest to Prophet)
    (0.50, 2),  # Tabi'un
    (0.25, 3),  # Tabi' al-Tabi'in
    (0.00, 4),  # Later scholars
]


def compute_tabaqah(dry_run: bool = False, batch_size: int = 1000) -> dict:
    """
    Compute and store tabaqah for all narrators without bio data.
    Returns stats dict.
    """
    con = sqlite3.connect(str(DB_PATH))
    cur = con.cursor()

    # Ensure data_source column exists
    try:
        cur.execute("ALTER TABLE narrators ADD COLUMN data_source TEXT")
        print("  + Added column: data_source")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e):
            print("  ~ Column already exists: data_source")
        else:
            raise

    # Get all narrators without tabaqah
    cur.execute("""
        SELECT n.id
        FROM narrators n
        WHERE n.tabaqah IS NULL
    """)
    null_ids = [row[0] for row in cur.fetchall()]
    print(f"  Narrators without tabaqah: {len(null_ids):,}")

    if not null_ids:
        print("  Nothing to do — all narrators have tabaqah.")
        con.close()
        return {'processed': 0, 'assigned': 0, 'skipped': 0}

    # Compute avg relative position for each narrator
    # position in DB: 0 = first narrator (collector), higher = closer to Prophet
    # chain_length = max position + 1 for that hadith
    print("  Computing relative positions...")

    cur.execute("""
        SELECT
            hn.narrator_id,
            hn.position,
            max_pos.max_position
        FROM hadith_narrators hn
        JOIN (
            SELECT hadith_id, MAX(position) as max_position
            FROM hadith_narrators
            GROUP BY hadith_id
        ) max_pos ON max_pos.hadith_id = hn.hadith_id
        WHERE hn.narrator_id IN ({})
        AND max_pos.max_position > 0
    """.format(','.join('?' * len(null_ids))), null_ids)

    # Aggregate by narrator
    narrator_positions = {}
    for narrator_id, position, max_position in cur.fetchall():
        if max_position == 0:
            continue
        relative_pos = position / max_position
        if narrator_id not in narrator_positions:
            narrator_positions[narrator_id] = []
        narrator_positions[narrator_id].append(relative_pos)

    print(f"  Narrators with chain data: {len(narrator_positions):,}")

    # Assign tabaqah based on avg relative position
    assigned = 0
    skipped = 0
    tabaqah_counts = {1: 0, 2: 0, 3: 0, 4: 0}

    for narrator_id, positions in narrator_positions.items():
        avg_pos = sum(positions) / len(positions)

        # Determine tabaqah
        tabaqah = 4  # default
        for threshold, t in TABAQAH_THRESHOLDS:
            if avg_pos >= threshold:
                tabaqah = t
                break

        tabaqah_counts[tabaqah] += 1

        if not dry_run:
            cur.execute("""
                UPDATE narrators
                SET tabaqah = ?, data_source = COALESCE(data_source, 'computed')
                WHERE id = ?
            """, (tabaqah, narrator_id))
        assigned += 1

    # Handle narrators with no chain data — assign tabaqah 4 (later scholars)
    no_data_count = len(null_ids) - len(narrator_positions)
    if no_data_count > 0 and not dry_run:
        no_data_ids = set(null_ids) - set(narrator_positions.keys())
        # Update in batches
        ids_list = list(no_data_ids)
        for i in range(0, len(ids_list), batch_size):
            batch = ids_list[i:i + batch_size]
            cur.execute("""
                UPDATE narrators
                SET tabaqah = 4, data_source = COALESCE(data_source, 'computed')
                WHERE id IN ({})
            """.format(','.join('?' * len(batch))), batch)
        tabaqah_counts[4] += no_data_count
        skipped += no_data_count

    if not dry_run:
        con.commit()

    con.close()

    return {
        'processed': len(null_ids),
        'assigned': assigned,
        'skipped': skipped,
        'tabaqah_counts': tabaqah_counts,
    }


def main():
    print("=== Auto-Tabaqah Computation ===\n")
    print("Computing tabaqah from chain positions...\n")

    stats = compute_tabaqah(dry_run=True)

    print(f"  Narrators to process: {stats['processed']:,}")
    print(f"  Will assign tabaqah:  {stats['assigned']:,}")
    print(f"  No chain data:        {stats['skipped']:,}")
    print(f"\n  Tabaqah distribution:")
    labels = {1: "Sahaba", 2: "Tabi'un", 3: "Tabi' al-Tabi'in", 4: "Later Scholar"}
    for t, count in stats['tabaqah_counts'].items():
        if count > 0:
            print(f"    {labels[t]}: {count:,}")

    print("\n" + "=" * 60)
    print("To apply changes, run:")
    print("  python3 scripts/auto-tabaqah.py --apply")


if __name__ == "__main__":
    import sys
    if '--apply' in sys.argv:
        print("Applying auto-tabaqah computation...\n")
        stats = compute_tabaqah(dry_run=False)
        print(f"  Assigned: {stats['assigned']:,}")
        print(f"  Skipped (no chain data): {stats['skipped']:,}")
        print(f"\n  Tabaqah distribution:")
        labels = {1: "Sahaba", 2: "Tabi'un", 3: "Tabi' al-Tabi'in", 4: "Later Scholar"}
        for t, count in stats['tabaqah_counts'].items():
            if count > 0:
                print(f"    {labels[t]}: {count:,}")

        # Verify
        con = sqlite3.connect(str(DB_PATH))
        cur = con.cursor()
        cur.execute("SELECT COUNT(*) FROM narrators WHERE tabaqah IS NOT NULL")
        total_with = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM narrators")
        total = cur.fetchone()[0]
        con.close()
        print(f"\nTotal with tabaqah: {total_with}/{total} ({total_with/total*100:.1f}%)")
    else:
        main()
