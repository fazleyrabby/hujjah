#!/usr/bin/env python3
"""
scripts/normalize-arabic.py

Arabic text normalization for narrator name matching.
Strips diacritics, normalizes variant characters, removes tatweel.

This fixes the ~148 existing seeds that failed to match due to diacritization.
"""

import re
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "src-tauri/resources/hujjah-hadith-core.db"


def normalize_arabic(text: str) -> str:
    """
    Normalize Arabic text for matching:
    1. Strip all diacritics (tashkeel): َ ُ ِ ّ ْ ً ٌ ٍ ٰ ٓ ٔ ٕ ٖ ٗ ٘ ٙ ٚ ٛ ٜ ٝ ٞ ٟ
    2. Normalize ي → ى (final ya variants)
    3. Normalize ة → ه (ta marbuta to ha)
    4. Normalize ا → ا (alif variants: آ إ أ → ا)
    5. Remove tatweel ـ
    6. Collapse multiple spaces
    """
    if not text:
        return text

    # 1. Strip diacritics (Unicode range U+064B-U+065F, plus U+0670)
    text = re.sub(r'[\u064B-\u065F\u0670]', '', text)

    # 2. Normalize ya variants: ى → ي (U+0649 → U+064A)
    #    Keep ى as-is since it's commonly used in names, but normalize for matching
    text = text.replace('ى', 'ي')

    # 3. Normalize ta marbuta: ة → ه (U+0629 → U+0647)
    text = text.replace('ة', 'ه')

    # 4. Normalize alif variants: آ إ أ ٱ → ا
    text = re.sub(r'[\u0622\u0623\u0625\u0671]', '\u0627', text)

    # 5. Remove tatweel
    text = text.replace('\u0640', '')

    # 6. Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    return text


def normalize_for_matching(text: str) -> str:
    """
    Full normalization for DB matching.
    Also strips common prefixes like ابن, ابو, ابو, etc.
    """
    text = normalize_arabic(text)

    # Strip common prefixes for fuzzy matching
    prefixes = ['ابن ', 'ابن', 'أبو ', 'أبو', 'ابو ', 'ابو', 'أم ', 'أم', 'ام ', 'ام']
    for prefix in prefixes:
        if text.startswith(prefix):
            text = text[len(prefix):].strip()
            break

    return text


def test_normalization():
    """Test the normalization function with known examples."""
    test_cases = [
        # (input, expected_normalized)
        ("أَبِي هُرَيْرَةَ", "ابي هريره"),
        ("ابْنِ عَبَّاسٍ", "ابن عباس"),
        ("عَائِشَةَ", "عائشه"),
        ("عُمَرَ بْنِ الْخَطَّابِ", "عمر بن الخطاب"),
        ("الزُّهْرِيِّ", "الزهري"),
        ("نَافِعٍ", "نافع"),
        ("مُحَمَّدِ بْنِ إِسْمَاعِيلَ", "محمد بن اسماعيل"),
        ("سُفْيَانُ", "سفيان"),
        ("سُفْيَانَ", "سفيان"),
        ("الثَّوْرِيِّ", "الثوري"),
        ("عَبْدِ الرَّحْمَنِ", "عبد الرحمن"),
        ("أَبِي سَعِيدٍ الْخُدْرِيِّ", "ابي سعيد الخدري"),
        ("يَحْيَى", "يحيي"),  # ي vs ى normalization
        ("يَحْيَىٰ", "يحيي"),  # with superscript alef
    ]

    print("Testing Arabic normalization:")
    print("=" * 60)
    all_pass = True
    for inp, expected in test_cases:
        result = normalize_arabic(inp)
        status = "✅" if result == expected else "❌"
        if result != expected:
            all_pass = False
            print(f"  {status} '{inp}' → '{result}' (expected: '{expected}')")
        else:
            print(f"  {status} '{inp}' → '{result}'")

    print(f"\n{'All tests passed!' if all_pass else 'Some tests failed!'}")
    return all_pass


def reseed_with_normalization(dry_run: bool = False) -> dict:
    """
    Re-run the bio data seeding from enrich-narrators.py with normalization.
    Returns stats dict.
    """
    import importlib.util
    spec = importlib.util.spec_from_file_location("enrich_narrators", str(Path(__file__).parent / "enrich-narrators.py"))
    enrich_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(enrich_mod)
    BIO_DATA = enrich_mod.BIO_DATA

    con = sqlite3.connect(str(DB_PATH))
    cur = con.cursor()

    # Build a lookup: normalized_name -> bio data
    bio_lookup = {}
    for (name_ar, name_en, birth, death, tabaqah, reliability, city) in BIO_DATA:
        norm = normalize_arabic(name_ar)
        if norm not in bio_lookup:
            bio_lookup[norm] = (name_ar, name_en, birth, death, tabaqah, reliability, city)

    # Get all narrators and normalize their names
    cur.execute("SELECT id, name_ar FROM narrators")
    all_narrators = cur.fetchall()

    # Build normalized lookup for DB names
    db_lookup = {}
    for nid, name_ar in all_narrators:
        norm = normalize_arabic(name_ar)
        if norm not in db_lookup:
            db_lookup[norm] = []
        db_lookup[norm].append(nid)

    # Match and update
    updated = 0
    new_matches = 0
    already_had = 0
    missed = 0

    for norm_name, bio in bio_lookup.items():
        name_ar, name_en, birth, death, tabaqah, reliability, city = bio

        # Check if this bio data already matched (exact match from previous run)
        cur.execute("SELECT id FROM narrators WHERE name_en = ? AND name_ar = ?", (name_en, name_ar))
        if cur.fetchone():
            already_had += 1
            continue

        # Try normalized match
        if norm_name in db_lookup:
            nids = db_lookup[norm_name]
            for nid in nids:
                if not dry_run:
                    cur.execute("""
                        UPDATE narrators
                        SET name_en = ?, birth_year = ?, death_year = ?,
                            tabaqah = ?, reliability = ?, city = ?
                        WHERE id = ?
                    """, (name_en, birth, death, tabaqah, reliability, city, nid))
                updated += 1
                new_matches += 1
        else:
            missed += 1

    if not dry_run:
        con.commit()

    con.close()

    return {
        'already_had': already_had,
        'new_matches': new_matches,
        'total_updated': updated,
        'missed': missed,
    }


def main():
    print("=== Arabic Normalization Utility ===\n")

    # Step 1: Test normalization
    test_normalization()
    print()

    # Step 2: Re-seed with normalization
    print("Re-seeding bio data with Arabic normalization...")
    print("(dry run — no changes made)\n")

    stats = reseed_with_normalization(dry_run=True)

    print(f"  Already matched (exact):  {stats['already_had']}")
    print(f"  New matches (normalized): {stats['new_matches']}")
    print(f"  Missed (no match found):  {stats['missed']}")
    print(f"\n  Total narrators that would be updated: {stats['total_updated']}")

    print("\n" + "=" * 60)
    print("To apply changes, run:")
    print("  python3 scripts/normalize-arabic.py --apply")


if __name__ == "__main__":
    import sys
    if '--apply' in sys.argv:
        print("Applying normalization-based seeding...\n")
        stats = reseed_with_normalization(dry_run=False)
        print(f"  New matches: {stats['new_matches']}")
        print(f"  Missed: {stats['missed']}")
        print(f"\n✅ Done. {stats['total_updated']} narrators updated.")

        # Verify
        con = sqlite3.connect(str(DB_PATH))
        cur = con.cursor()
        cur.execute("SELECT COUNT(*) FROM narrators WHERE name_en IS NOT NULL")
        total_enriched = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM narrators")
        total = cur.fetchone()[0]
        con.close()
        print(f"\nTotal enriched: {total_enriched}/{total} ({total_enriched/total*100:.1f}%)")
    else:
        main()
