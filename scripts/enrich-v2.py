#!/usr/bin/env python3
"""
scripts/enrich-v2.py

Master script for narrator bio enrichment pipeline.
Runs all enrichment steps in order:

  1. Arabic normalization + re-seed existing bio data
  2. Auto-tabaqah from chain positions (fallback for all 24K)
  3. Bengali transliteration via llama-server (optional, requires running server)

Usage:
  python3 scripts/enrich-v2.py           # Dry run all steps
  python3 scripts/enrich-v2.py --apply   # Apply all changes
  python3 scripts/enrich-v2.py --skip-bn # Skip Bengali transliteration
"""

import importlib.util
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "src-tauri/resources/hujjah-hadith-core.db"
SCRIPTS_DIR = Path(__file__).parent


def load_script_module(module_name: str, filename: str):
    """Load a script module from a filename so hyphenated files still work."""
    module_path = SCRIPTS_DIR / filename
    spec = importlib.util.spec_from_file_location(module_name, str(module_path))
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def print_header(title: str):
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}\n")


def print_stats():
    """Print current DB enrichment stats."""
    con = sqlite3.connect(str(DB_PATH))
    cur = con.cursor()

    cur.execute("SELECT COUNT(*) FROM narrators")
    total = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM narrators WHERE name_en IS NOT NULL")
    with_en = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM narrators WHERE name_bn IS NOT NULL")
    with_bn = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM narrators WHERE tabaqah IS NOT NULL")
    with_tabaqah = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM narrators WHERE data_source IS NOT NULL")
    with_source = cur.fetchone()[0]

    cur.execute("""
        SELECT data_source, COUNT(*)
        FROM narrators
        WHERE data_source IS NOT NULL
        GROUP BY data_source
    """)
    sources = cur.fetchall()

    con.close()

    print(f"  Total narrators:      {total:,}")
    print(f"  With name_en:         {with_en:,} ({with_en/total*100:.1f}%)")
    print(f"  With name_bn:         {with_bn:,} ({with_bn/total*100:.1f}%)")
    print(f"  With tabaqah:         {with_tabaqah:,} ({with_tabaqah/total*100:.1f}%)")
    print(f"  With data_source:     {with_source:,}")
    if sources:
        print(f"  Data sources:")
        for source, count in sources:
            print(f"    {source}: {count:,}")


def step_normalize(dry_run: bool = False) -> bool:
    """Step 1: Arabic normalization + re-seed bio data."""
    print_header("Step 1: Arabic Normalization + Bio Re-seeding")

    try:
        normalize_mod = load_script_module("normalize_arabic", "normalize-arabic.py")

        normalize_mod.test_normalization()
        print()

        stats = normalize_mod.reseed_with_normalization(dry_run=dry_run)

        print(f"  Already matched:  {stats['already_had']}")
        print(f"  New matches:      {stats['new_matches']}")
        print(f"  Missed:           {stats['missed']}")

        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def step_tabaqah(dry_run: bool = False) -> bool:
    """Step 2: Auto-tabaqah from chain positions."""
    print_header("Step 2: Auto-Tabaqah Computation")

    try:
        tabaqah_mod = load_script_module("auto_tabaqah", "auto-tabaqah.py")

        stats = tabaqah_mod.compute_tabaqah(dry_run=dry_run)

        print(f"  Processed: {stats['processed']:,}")
        print(f"  Assigned:  {stats['assigned']:,}")
        print(f"  Skipped:   {stats['skipped']:,}")

        labels = {1: "Sahaba", 2: "Tabi'un", 3: "Tabi' al-Tabi'in", 4: "Later Scholar"}
        counts = stats.get('tabaqah_counts', {})
        print(f"\n  Tabaqah distribution:")
        if not counts:
            print("    No narrators required computation.")
        else:
            for t, count in counts.items():
                if count > 0:
                    print(f"    {labels[t]}: {count:,}")

        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def step_bengali(dry_run: bool = False) -> bool:
    """Step 3: Bengali transliteration via llama-server."""
    print_header("Step 3: Bengali Transliteration")

    try:
        translate_mod = load_script_module("translate_bn", "translate-bn.py")

        translate_mod.main(dry_run=dry_run)
        return True
    except Exception as e:
        print(f"  ERROR: {e}")
        return False


def main():
    dry_run = '--apply' not in sys.argv
    skip_bn = '--skip-bn' in sys.argv

    print("╔══════════════════════════════════════════════════════════╗")
    print("║     Narrator Bio Enrichment Pipeline (v2)              ║")
    print("╚══════════════════════════════════════════════════════════╝")

    mode = "DRY RUN" if dry_run else "APPLY"
    print(f"\n  Mode: {mode}")
    if skip_bn:
        print("  Bengali transliteration: SKIPPED")

    print("\n  Current state:")
    print_stats()

    # Step 1: Normalization
    if not step_normalize(dry_run=dry_run):
        print("\n  ❌ Step 1 failed. Aborting.")
        return

    # Step 2: Auto-tabaqah
    if not step_tabaqah(dry_run=dry_run):
        print("\n  ❌ Step 2 failed. Aborting.")
        return

    # Step 3: Bengali (optional)
    if not skip_bn:
        if not step_bengali(dry_run=dry_run):
            print("\n  ⚠️  Step 3 failed. Continuing...")

    # Final stats
    print_header("Final State")
    print_stats()

    if dry_run:
        print(f"\n{'=' * 60}")
        print("  This was a DRY RUN. No changes were made.")
        print("  To apply changes, run:")
        print("  python3 scripts/enrich-v2.py --apply")
        print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
