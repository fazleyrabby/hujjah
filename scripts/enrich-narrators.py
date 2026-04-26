#!/usr/bin/env python3
"""
enrich-narrators.py
Migrates hujjah-hadith-core.db:
  1. Adds bio columns to narrators table
  2. Creates performance indexes
  3. Creates FTS5 search index on narrator names
  4. Seeds bio data for top ~200 Kutub al-Sittah narrators
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "src-tauri/resources/hujjah-hadith-core.db"

# ─── Bio data: top narrators from Kutub al-Sittah ────────────────────────────
# Format: (name_ar, name_en, birth_year_AH, death_year_AH, tabaqah, reliability, city)
# tabaqah: 1=Sahaba, 2=Tabi'un, 3=Tabi' al-Tabi'in, 4+=later scholars
BIO_DATA = [
    # Sahaba (Tabaqah 1)
    ("أَبِي هُرَيْرَةَ", "Abu Hurayra", None, 57, 1, "thiqah", "Medina"),
    ("ابْنِ عَبَّاسٍ", "Ibn Abbas", 3, 68, 1, "thiqah", "Mecca"),
    ("ابْنِ عُمَرَ", "Ibn Umar", 10, 74, 1, "thiqah", "Medina"),
    ("عَائِشَةَ", "Aisha", None, 58, 1, "thiqah", "Medina"),
    ("أَنَسِ بْنِ مَالِكٍ", "Anas ibn Malik", None, 93, 1, "thiqah", "Basra"),
    ("جَابِرِ بْنِ عَبْدِ اللَّهِ", "Jabir ibn Abd Allah", None, 74, 1, "thiqah", "Medina"),
    ("عَبْدِ اللَّهِ بْنِ مَسْعُودٍ", "Ibn Masud", None, 32, 1, "thiqah", "Kufa"),
    ("عُمَرَ بْنِ الْخَطَّابِ", "Umar ibn al-Khattab", None, 23, 1, "thiqah", "Medina"),
    ("عُثْمَانَ بْنِ عَفَّانَ", "Uthman ibn Affan", None, 35, 1, "thiqah", "Medina"),
    ("عَلِيِّ بْنِ أَبِي طَالِبٍ", "Ali ibn Abi Talib", None, 40, 1, "thiqah", "Kufa"),
    ("أَبِي سَعِيدٍ الْخُدْرِيِّ", "Abu Said al-Khudri", None, 74, 1, "thiqah", "Medina"),
    ("أَبِي مُوسَى الْأَشْعَرِيِّ", "Abu Musa al-Ashari", None, 44, 1, "thiqah", "Basra"),
    ("الْبَرَاءِ بْنِ عَازِبٍ", "Al-Bara ibn Azib", None, 72, 1, "thiqah", "Kufa"),
    ("بُرَيْدَةَ الْأَسْلَمِيِّ", "Burayda al-Aslami", None, 63, 1, "thiqah", "Merv"),
    ("أَبِي ذَرٍّ الْغِفَارِيِّ", "Abu Dharr al-Ghifari", None, 32, 1, "thiqah", "Medina"),
    # Tabi'un (Tabaqah 2)
    ("الزُّهْرِيِّ", "al-Zuhri", 51, 124, 2, "thiqah", "Medina"),
    ("ابْنِ شِهَابٍ", "Ibn Shihab (al-Zuhri)", 51, 124, 2, "thiqah", "Medina"),
    ("نَافِعٍ", "Nafi (mawla Ibn Umar)", None, 117, 2, "thiqah", "Medina"),
    ("قَتَادَةَ", "Qatada ibn Di'ama", 61, 118, 2, "thiqah", "Basra"),
    ("الْأَعْمَشِ", "al-Amash", 61, 148, 2, "thiqah", "Kufa"),
    ("عَطَاءِ بْنِ أَبِي رَبَاحٍ", "Ata ibn Abi Rabah", 27, 114, 2, "thiqah", "Mecca"),
    ("سَعِيدِ بْنِ الْمُسَيَّبِ", "Said ibn al-Musayyab", 13, 94, 2, "thiqah", "Medina"),
    ("إِبْرَاهِيمَ النَّخَعِيِّ", "Ibrahim al-Nakhai", 46, 96, 2, "thiqah", "Kufa"),
    ("مُجَاهِدٍ", "Mujahid ibn Jabr", 21, 104, 2, "thiqah", "Mecca"),
    ("عُرْوَةَ بْنِ الزُّبَيْرِ", "Urwa ibn al-Zubayr", 23, 94, 2, "thiqah", "Medina"),
    ("سَالِمِ بْنِ عَبْدِ اللَّهِ", "Salim ibn Abd Allah", None, 106, 2, "thiqah", "Medina"),
    ("أَبِي سَلَمَةَ بْنِ عَبْدِ الرَّحْمَنِ", "Abu Salama ibn Abd al-Rahman", None, 94, 2, "thiqah", "Medina"),
    ("سُلَيْمَانَ التَّيْمِيِّ", "Sulayman al-Taymi", None, 143, 2, "thiqah", "Basra"),
    ("يَحْيَى بْنِ أَبِي كَثِيرٍ", "Yahya ibn Abi Kathir", None, 132, 2, "thiqah", "Yamama"),
    ("هِشَامِ بْنِ عُرْوَةَ", "Hisham ibn Urwa", 61, 146, 2, "thiqah", "Medina"),
    ("الْحَسَنِ الْبَصْرِيِّ", "al-Hasan al-Basri", 21, 110, 2, "thiqah", "Basra"),
    ("مُحَمَّدِ بْنِ سِيرِينَ", "Muhammad ibn Sirin", 33, 110, 2, "thiqah", "Basra"),
    ("عَمْرِو بْنِ دِينَارٍ", "Amr ibn Dinar", 45, 126, 2, "thiqah", "Mecca"),
    ("طَاوُسٍ", "Tawus ibn Kaysan", None, 106, 2, "thiqah", "Yemen"),
    ("عِكْرِمَةَ", "Ikrima (mawla Ibn Abbas)", None, 107, 2, "thiqah", "Medina"),
    # Tabi' al-Tabi'in (Tabaqah 3)
    ("مَالِكٍ", "Malik ibn Anas", 93, 179, 3, "thiqah", "Medina"),
    ("شُعْبَةُ", "Shuba ibn al-Hajjaj", 82, 160, 3, "thiqah", "Basra"),
    ("شُعْبَةَ", "Shuba ibn al-Hajjaj", 82, 160, 3, "thiqah", "Basra"),
    ("سُفْيَانُ", "Sufyan al-Thawri", 97, 161, 3, "thiqah", "Kufa"),
    ("سُفْيَانَ", "Sufyan al-Thawri", 97, 161, 3, "thiqah", "Kufa"),
    ("سُفْيَانُ بْنُ عُيَيْنَةَ", "Sufyan ibn Uyayna", 107, 198, 3, "thiqah", "Mecca"),
    ("اللَّيْثُ", "al-Layth ibn Sad", 94, 175, 3, "thiqah", "Egypt"),
    ("ابْنُ وَهْبٍ", "Ibn Wahb", 125, 197, 3, "thiqah", "Egypt"),
    ("ابْنِ جُرَيْجٍ", "Ibn Jurayj", 80, 150, 3, "thiqah", "Mecca"),
    ("الثَّوْرِيِّ", "Sufyan al-Thawri", 97, 161, 3, "thiqah", "Kufa"),
    ("مَعْمَرٌ", "Mamar ibn Rashid", 95, 154, 3, "thiqah", "Yemen"),
    ("حَمَّادُ بْنُ زَيْدٍ", "Hammad ibn Zayd", 98, 179, 3, "thiqah", "Basra"),
    ("حَمَّادُ بْنُ سَلَمَةَ", "Hammad ibn Salama", 91, 167, 3, "thiqah", "Basra"),
    ("حَمَّادٌ", "Hammad (ibn Zayd or Salama)", 98, 179, 3, "thiqah", "Basra"),
    ("الْأَوْزَاعِيِّ", "al-Awzai", 88, 157, 3, "thiqah", "Damascus"),
    ("عَبْدِ اللَّهِ بْنِ إِدْرِيسَ", "Abd Allah ibn Idris", 115, 192, 3, "thiqah", "Kufa"),
    ("يَحْيَى بْنِ سَعِيدٍ الْقَطَّانِ", "Yahya ibn Said al-Qattan", 120, 198, 3, "thiqah", "Basra"),
    ("يَحْيَى بْنِ سَعِيدٍ", "Yahya ibn Said", 120, 198, 3, "thiqah", "Basra"),
    ("عَبْدُ الرَّزَّاقِ", "Abd al-Razzaq ibn Hammam", 126, 211, 3, "thiqah", "Sanaa"),
    ("وَكِيعٌ", "Waki ibn al-Jarrah", 128, 197, 3, "thiqah", "Kufa"),
    ("عَبْدُ الرَّحْمَنِ بْنُ مَهْدِيٍّ", "Abd al-Rahman ibn Mahdi", 135, 198, 3, "thiqah", "Basra"),
    # Later scholars (Tabaqah 4+)
    ("أَبُو بَكْرِ بْنُ أَبِي شَيْبَةَ", "Abu Bakr ibn Abi Shayba", 159, 235, 4, "thiqah", "Kufa"),
    ("مُحَمَّدُ بْنُ الْمُثَنَّى", "Muhammad ibn al-Muthanna", 167, 252, 4, "thiqah", "Basra"),
    ("مُحَمَّدُ بْنُ بَشَّارٍ", "Muhammad ibn Bashhar (Bundar)", 167, 252, 4, "thiqah", "Basra"),
    ("قُتَيْبَةُ بْنُ سَعِيدٍ", "Qutayba ibn Said", 148, 240, 4, "thiqah", "Balkh"),
    ("قُتَيْبَةُ", "Qutayba ibn Said", 148, 240, 4, "thiqah", "Balkh"),
    ("زُهَيْرُ بْنُ حَرْبٍ", "Zuhayr ibn Harb (Abu Khaythama)", 160, 234, 4, "thiqah", "Baghdad"),
    ("إِسْحَاقُ بْنُ إِبْرَاهِيمَ", "Ishaq ibn Ibrahim (Ibn Rahawayh)", 161, 238, 4, "thiqah", "Nishapur"),
    ("مُسَدَّدٌ", "Musaddad ibn Musarhad", None, 228, 4, "thiqah", "Basra"),
    ("عَلِيُّ بْنُ الْمَدِينِيِّ", "Ali ibn al-Madini", 161, 234, 4, "thiqah", "Basra"),
    ("أَحْمَدُ بْنُ حَنْبَلٍ", "Ahmad ibn Hanbal", 164, 241, 4, "thiqah", "Baghdad"),
    ("يَحْيَى بْنُ مَعِينٍ", "Yahya ibn Main", 158, 233, 4, "thiqah", "Baghdad"),
    ("عَبْدُ اللَّهِ بْنُ يُوسُفَ", "Abd Allah ibn Yusuf al-Tinnisi", 145, 218, 4, "thiqah", "Damascus"),
    ("إِسْمَاعِيلُ بْنُ أَبِي أُوَيْسٍ", "Ismail ibn Abi Uwais", 139, 226, 4, "thiqah", "Medina"),
    ("سَعِيدُ بْنُ عُفَيْرٍ", "Said ibn Ufayr", 156, 226, 4, "thiqah", "Egypt"),
    ("عَبْدُ اللَّهِ بْنُ مَسْلَمَةَ", "Abd Allah ibn Maslama al-Qanabi", 138, 221, 4, "thiqah", "Medina"),
    ("مُحَمَّدُ بْنُ عَبْدِ اللَّهِ بْنِ نُمَيْرٍ", "Muhammad ibn Abd Allah ibn Numayr", None, 234, 4, "thiqah", "Kufa"),
    ("مُحَمَّدُ بْنُ رُمْحٍ", "Muhammad ibn Rumh", None, 242, 4, "thiqah", "Egypt"),
    ("هَنَّادُ بْنُ السَّرِيِّ", "Hannad ibn al-Sari", 152, 243, 4, "thiqah", "Kufa"),
    ("أَبُو كُرَيْبٍ", "Abu Kurayb Muhammad ibn al-Ala", 161, 248, 4, "thiqah", "Kufa"),
    ("عَبْدُ اللَّهِ بْنُ عَبْدِ الرَّحْمَنِ", "Abd Allah ibn Abd al-Rahman al-Darimi", 181, 255, 4, "thiqah", "Samarkand"),
    ("مُحَمَّدُ بْنُ عَبْدِ الْأَعْلَى", "Muhammad ibn Abd al-Ala", None, 245, 4, "thiqah", "Basra"),
    ("غُنْدَرٌ", "Ghundar (Muhammad ibn Jafar)", 110, 193, 4, "thiqah", "Basra"),
    ("يَزِيدُ بْنُ زُرَيْعٍ", "Yazid ibn Zuray", 101, 182, 4, "thiqah", "Basra"),
    ("ابْنُ عُلَيَّةَ", "Ibn Ulayya (Ismail ibn Ibrahim)", 110, 193, 4, "thiqah", "Basra"),
    ("إِسْمَاعِيلُ بْنُ عُلَيَّةَ", "Ismail ibn Ulayya", 110, 193, 4, "thiqah", "Basra"),
    ("هُشَيْمٌ", "Hushaym ibn Bashir", 104, 183, 4, "thiqah", "Wasit"),
    ("جَرِيرٌ", "Jarir ibn Abd al-Hamid", 107, 188, 4, "thiqah", "Rayy"),
    ("خَالِدُ بْنُ الْحَارِثِ", "Khalid ibn al-Harith", 109, 186, 4, "thiqah", "Basra"),
    ("مُعَاذُ بْنُ مُعَاذٍ", "Muadh ibn Muadh", 119, 196, 4, "thiqah", "Basra"),
    ("مُحَمَّدُ بْنُ جَعْفَرٍ", "Muhammad ibn Jafar (Ghundar)", 110, 193, 4, "thiqah", "Basra"),
    ("أَبُو عَوَانَةَ", "Abu Awana al-Wadhdhah", 102, 176, 3, "thiqah", "Wasit"),
    ("هُشَيْمِ بْنِ بَشِيرٍ", "Hushaym ibn Bashir", 104, 183, 4, "thiqah", "Wasit"),
    ("عَبْدُ الْوَارِثِ", "Abd al-Warith ibn Said", 100, 180, 3, "thiqah", "Basra"),
    ("حَفْصُ بْنُ غِيَاثٍ", "Hafs ibn Ghiyath", 117, 194, 4, "thiqah", "Kufa"),
    ("أَبُو نُعَيْمٍ", "Abu Nuaym al-Fadl ibn Dukayn", 130, 219, 4, "thiqah", "Kufa"),
    ("سُفْيَانُ بْنُ حُسَيْنٍ", "Sufyan ibn Husayn", None, 148, 3, "saduq", "Wasit"),
    ("مُحَمَّدُ بْنُ إِسْمَاعِيلَ", "Muhammad ibn Ismail al-Bukhari", 194, 256, 4, "thiqah", "Bukhara"),
    ("الْحَجَّاجُ بْنُ مُحَمَّدٍ", "al-Hajjaj ibn Muhammad al-Masisi", 127, 206, 4, "thiqah", "Baghdad"),
    ("عَبْدُ الرَّزَّاقِ بْنُ هَمَّامٍ", "Abd al-Razzaq ibn Hammam", 126, 211, 3, "thiqah", "Sanaa"),
    ("ابْنُ أَبِي عُمَرَ", "Ibn Abi Umar al-Adani", 156, 243, 4, "thiqah", "Mecca"),
    ("أَبُو الطَّاهِرِ", "Abu al-Tahir Ahmad ibn Amr", 162, 250, 4, "thiqah", "Egypt"),
    ("حَرْمَلَةُ بْنُ يَحْيَى", "Harmala ibn Yahya", 166, 243, 4, "thiqah", "Egypt"),
    ("أَبُو الرَّبِيعِ", "Abu al-Rabi Sulayman ibn Dawud", None, 234, 4, "thiqah", "Baghdad"),
    ("مُحَمَّدُ بْنُ سَلَمَةَ", "Muhammad ibn Salama al-Harrani", None, 191, 4, "thiqah", "Harran"),
    ("يُونُسُ بْنُ عَبْدِ الْأَعْلَى", "Yunus ibn Abd al-Ala", 170, 264, 4, "thiqah", "Egypt"),
    ("الْمُقَدَّمِيُّ", "Muhammad ibn Abi Bakr al-Muqaddami", 155, 234, 4, "thiqah", "Basra"),
    ("عَمْرٌو النَّاقِدُ", "Amr ibn Ali al-Naqid", 160, 249, 4, "thiqah", "Basra"),
]

def get_tabaqah_label(tabaqah):
    return {1: "Sahaba", 2: "Tabi'un", 3: "Tabi' al-Tabi'in", 4: "Later Scholar"}.get(tabaqah, "Unknown")

def main():
    print(f"Opening DB: {DB_PATH}")
    con = sqlite3.connect(str(DB_PATH))
    cur = con.cursor()

    # ── Step 1: Add bio columns ──────────────────────────────────────────────
    print("Adding bio columns to narrators table...")
    columns = [
        ("name_en", "TEXT"),
        ("birth_year", "INTEGER"),
        ("death_year", "INTEGER"),
        ("tabaqah", "INTEGER"),
        ("reliability", "TEXT"),
        ("city", "TEXT"),
    ]
    for col, dtype in columns:
        try:
            cur.execute(f"ALTER TABLE narrators ADD COLUMN {col} {dtype}")
            print(f"  + Added column: {col}")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e):
                print(f"  ~ Column already exists: {col}")
            else:
                raise

    # ── Step 2: Create indexes ───────────────────────────────────────────────
    print("Creating indexes...")
    indexes = [
        ("idx_hn_hadith_pos", "hadith_narrators(hadith_id, position)"),
        ("idx_ne_from",       "narrator_edges(from_narrator_id)"),
        ("idx_ne_to",         "narrator_edges(to_narrator_id)"),
        ("idx_narrators_name_ar", "narrators(name_ar)"),
    ]
    for idx_name, idx_def in indexes:
        cur.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {idx_def}")
        print(f"  + Index: {idx_name}")

    # ── Step 3: FTS5 on narrator names ──────────────────────────────────────
    print("Creating FTS5 narrator search index...")
    try:
        cur.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS narrator_search_idx USING fts5(
                name_ar, name_en,
                content='narrators', content_rowid='id'
            )
        """)
        print("  + Created narrator_search_idx")
    except sqlite3.OperationalError as e:
        print(f"  ~ FTS5 table: {e}")

    con.commit()

    # ── Step 4: Seed bio data ────────────────────────────────────────────────
    print("Seeding bio data for known narrators...")
    updated = 0
    skipped = 0

    for (name_ar, name_en, birth, death, tabaqah, reliability, city) in BIO_DATA:
        # Find matching narrator(s) by exact name_ar
        cur.execute("SELECT id FROM narrators WHERE name_ar = ?", (name_ar,))
        rows = cur.fetchall()
        if not rows:
            skipped += 1
            continue
        for (nid,) in rows:
            cur.execute("""
                UPDATE narrators
                SET name_en = ?, birth_year = ?, death_year = ?,
                    tabaqah = ?, reliability = ?, city = ?
                WHERE id = ?
            """, (name_en, birth, death, tabaqah, reliability, city, nid))
            updated += 1

    con.commit()
    print(f"  Bio data: {updated} narrators updated, {skipped} names not found in DB")

    # ── Step 5: Populate FTS5 index ──────────────────────────────────────────
    print("Populating FTS5 index...")
    try:
        cur.execute("INSERT INTO narrator_search_idx(narrator_search_idx) VALUES('rebuild')")
        con.commit()
        print("  + FTS5 index rebuilt")
    except sqlite3.OperationalError as e:
        print(f"  ~ FTS5 rebuild: {e}")

    # ── Step 6: Verify ───────────────────────────────────────────────────────
    cur.execute("SELECT COUNT(*) FROM narrators WHERE name_en IS NOT NULL")
    enriched = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM narrators")
    total = cur.fetchone()[0]
    cur.execute("SELECT name_ar, name_en, tabaqah, death_year FROM narrators WHERE name_en IS NOT NULL ORDER BY tabaqah, death_year LIMIT 10")
    samples = cur.fetchall()

    con.close()

    print(f"\n✅ Done. {enriched}/{total} narrators have bio data.")
    print("\nSample enriched narrators:")
    for r in samples:
        tab = get_tabaqah_label(r[2])
        print(f"  {r[0]} → {r[1]} | {tab} | d.{r[3]} AH")

if __name__ == "__main__":
    main()
