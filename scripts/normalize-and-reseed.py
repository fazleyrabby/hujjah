#!/usr/bin/env python3
"""
scripts/normalize-and-reseed.py
Re-applies BIO_DATA from enrich-narrators.py with Arabic normalization matching.
"""

import re
import sqlite3
import importlib.util
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "src-tauri/resources/hujjah-hadith-core.db"

def normalize_arabic(text: str) -> str:
    # Strip harakat (diacritics): Unicode range 0x064B–0x065F + 0x0670
    text = re.sub(r'[\u064B-\u065F\u0670]', '', text)
    # Normalize alef variants → bare alef
    text = re.sub(r'[ٱآإأ]', 'ا', text)
    # Normalize teh marbuta → heh
    text = text.replace('ة', 'ه')
    # Normalize alef maqsura → yeh
    text = text.replace('ى', 'ي')
    # Remove tatweel
    text = text.replace('ـ', '')
    return text.strip()

def main():
    # Load BIO_DATA from enrich-narrators.py
    spec = importlib.util.spec_from_file_location(
        "enrich_narrators", str(Path(__file__).parent / "enrich-narrators.py"))
    enrich_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(enrich_mod)
    BIO_DATA = enrich_mod.BIO_DATA

    con = sqlite3.connect(str(DB_PATH))
    cur = con.cursor()

    # Build lookup: {normalized_name_ar: narrator_id}
    print("Building normalized name lookup for 24,184 narrators...")
    cur.execute("SELECT id, name_ar FROM narrators")
    db_lookup = {}
    for nid, name_ar in cur.fetchall():
        norm = normalize_arabic(name_ar)
        if norm not in db_lookup:
            db_lookup[norm] = []
        db_lookup[norm].append(nid)

    print(f"  Unique normalized names: {len(db_lookup):,}")

    # Match BIO_DATA entries
    updated = 0
    missed = 0
    already_set = 0

    for (name_ar, name_en, birth, death, tabaqah, reliability, city) in BIO_DATA:
        norm = normalize_arabic(name_ar)
        if norm in db_lookup:
            nids = db_lookup[norm]
            for nid in nids:
                # Check if already has this data
                cur.execute("SELECT name_en FROM narrators WHERE id = ?", (nid,))
                existing = cur.fetchone()[0]
                if existing == name_en:
                    already_set += 1
                    continue
                cur.execute("""
                    UPDATE narrators
                    SET name_en = ?, birth_year = ?, death_year = ?,
                        tabaqah = ?, reliability = ?, city = ?, data_source = 'manual'
                    WHERE id = ?
                """, (name_en, birth, death, tabaqah, reliability, city, nid))
                updated += 1
        else:
            missed += 1

    con.commit()
    con.close()

    print(f"\n  Updated:  {updated}")
    print(f"  Already:  {already_set}")
    print(f"  Missed:   {missed}")
    print(f"  Total matched: {updated + already_set}/{len(BIO_DATA)}")

if __name__ == "__main__":
    main()
