#!/usr/bin/env python3
"""
scripts/sunnah-migration/07-fix-translations.py

Phase 7: Fix Orphan Translations + Fill Gaps from Backup

1. Delete orphan translations (bad hadith IDs)
2. Import missing EN/BN translations from backup DB by (book_id, num_in_book)
3. Report final coverage

Usage: python3 07-fix-translations.py
"""

import sqlite3
from pathlib import Path

CURRENT_DB = '/Users/rabbi/Desktop/Projects/hujjah/apps/web/data/hujjah-hadith-core.db'
BACKUP_DB  = '/Users/rabbi/Desktop/hujjahBackup/hujjah-hadith-core.db'

LANG_MAP = {'en': 'English', 'bn': 'Bengali'}


def log_counts(cursor, label):
    cursor.execute("SELECT COUNT(*) FROM hadiths")
    total = cursor.fetchone()[0]
    cursor.execute("""
        SELECT ht.lang_code, COUNT(DISTINCT ht.hadith_id)
        FROM hadith_translations ht
        JOIN hadiths h ON ht.hadith_id = h.id
        GROUP BY ht.lang_code
    """)
    covered = dict(cursor.fetchall())
    print(f'  {label}: {total:,} hadiths, '
          f'EN={covered.get("en", 0):,}, BN={covered.get("bn", 0):,}')


def main():
    print('[FixTranslations] Starting...\n')

    db = sqlite3.connect(CURRENT_DB)
    backup = sqlite3.connect(BACKUP_DB)

    log_counts(db, 'Before')

    # === Step 1: Delete orphan translations ===
    print('\n[Step 1] Deleting orphan translations...')
    db.execute("DELETE FROM hadith_translations WHERE hadith_id NOT IN (SELECT id FROM hadiths)")
    deleted = db.rowcount
    db.commit()
    print(f'  Deleted {deleted:,} orphan rows')
    log_counts(db, 'After cleanup')

    # === Step 2: Build (book_id, num_in_book) → hadith_id map from backup ===
    print('\n[Step 2] Building backup index...')
    backup_cur = backup.execute("SELECT id, book_id, num_in_book FROM hadiths")
    backup_map = {}  # (book_id, num_in_book) → old_hadith_id
    for row in backup_cur.fetchall():
        backup_map[(row[1], row[2])] = row[0]
    print(f'  Indexed {len(backup_map):,} backup hadiths')

    # === Step 3: Load backup translations ===
    print('\n[Step 3] Loading backup translations...')
    backup_trans = {}  # (old_hadith_id, lang_code) → (matn_text, translator)
    bcur = backup.execute("SELECT hadith_id, lang_code, matn_text, translator FROM hadith_translations")
    for row in bcur.fetchall():
        backup_trans[(row[0], row[1])] = (row[2], row[3])
    print(f'  Loaded {len(backup_trans):,} backup translations')

    # === Step 4: Match & import missing translations ===
    print('\n[Step 4] Importing missing translations...')
    
    cur = db.execute("""
        SELECT h.id, h.book_id, h.num_in_book, h.source
        FROM hadiths h
    """)
    
    imported = {'en': 0, 'bn': 0}
    skipped = {'en': 0, 'bn': 0}
    
    batch = []
    for hadith in cur.fetchall():
        new_id, book_id, num_in_book, source = hadith
        key = (book_id, num_in_book)
        
        if key not in backup_map:
            continue
        
        old_id = backup_map[key]
        
        for lang in ('en', 'bn'):
            # Check if current hadith already has translation for this lang
            existing = db.execute(
                "SELECT COUNT(*) FROM hadith_translations WHERE hadith_id = ? AND lang_code = ?",
                (new_id, lang)
            ).fetchone()[0]
            
            if existing > 0:
                skipped[lang] += 1
                continue
            
            trans_key = (old_id, lang)
            if trans_key not in backup_trans:
                continue
            
            text, translator = backup_trans[trans_key]
            batch.append((new_id, lang, text[:5000], translator))
            imported[lang] += 1
            
            if len(batch) >= 500:
                db.executemany(
                    "INSERT INTO hadith_translations (hadith_id, lang_code, matn_text, translator) VALUES (?, ?, ?, ?)",
                    batch
                )
                db.commit()
                batch = []
    
    if batch:
        db.executemany(
            "INSERT INTO hadith_translations (hadith_id, lang_code, matn_text, translator) VALUES (?, ?, ?, ?)",
            batch
        )
        db.commit()
    
    print(f'  Imported: EN={imported["en"]:,}, BN={imported["bn"]:,}')
    print(f'  Skipped (already exists): EN={skipped["en"]:,}, BN={skipped["bn"]:,}')

    # === Step 5: Report final coverage ===
    print(f'\n[Step 5] Final coverage:')
    log_counts(db, 'After')

    db.close()
    backup.close()
    print('\n[FixTranslations] Done!')

    # Print summary of remaining gaps
    db2 = sqlite3.connect(CURRENT_DB)
    db2.execute("""
        SELECT 
            SUM(CASE WHEN ht_en.id IS NULL THEN 1 ELSE 0 END) AS missing_en,
            SUM(CASE WHEN ht_bn.id IS NULL THEN 1 ELSE 0 END) AS missing_bn
        FROM hadiths h
        LEFT JOIN hadith_translations ht_en ON ht_en.hadith_id = h.id AND ht_en.lang_code = 'en'
        LEFT JOIN hadith_translations ht_bn ON ht_bn.hadith_id = h.id AND ht_bn.lang_code = 'bn'
    """)
    row = db2.fetchone()
    print(f'\nRemaining gaps after backup import:')
    print(f'  Missing EN: {row[0]:,}')
    print(f'  Missing BN: {row[1]:,}')
    if row[0] > 0:
        print(f'  -> These need AI-generated English translations (sunnah.com hadiths)')
    if row[1] > 0:
        print(f'  -> These need AI-generated Bengali translations')
    db2.close()


if __name__ == '__main__':
    main()
