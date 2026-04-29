#!/usr/bin/env python3
"""
scripts/sunnah-migration/03-restore-bengali.py

Phase 3: Restore Bengali Translations (SIMPLIFIED)
- Use existing Bengali translations from backup
- Match by (sunnah_collection, sunnah_hadith_number)
- Also keep ai translations

Usage: python3 03-restore-bengali.py
"""

import sqlite3
import csv
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
EXPORT_DIR = SCRIPT_DIR / 'exports'
BACKUP_DB = '/Users/rabbi/Desktop/hujjahBackup/hujjah-hadith-core.db'

def main():
    print('[Bengali] Starting Bengali restoration (simplified)...\n')
    
    # Connect to DBs
    db_path = '/Users/rabbi/Desktop/Projects/hujjah/apps/web/data/hujjah-hadith-core.db'
    db = sqlite3.connect(db_path)
    cursor = db.cursor()
    
    backup = sqlite3.connect(BACKUP_DB)
    bcursor = backup.cursor()
    
    # Get existing Bengali translations from backup
    print('[Bengali] Loading existing Bengali translations from backup...')
    bcursor.execute('''
        SELECT ht.hadith_id, ht.matn_text, h.book_id, h.num_in_book
        FROM hadith_translations ht
        JOIN hadiths h ON ht.hadith_id = h.id
        WHERE ht.lang_code = 'bn'
    ''')
    
    # Key: (book_id, num_in_book) -> text
    existing_bn = {}
    for row in bcursor.fetchall():
        old_hadith_id, text, book_id, num_in_book = row
        key = (book_id, num_in_book)
        if key not in existing_bn:
            existing_bn[key] = text
    
    print(f'Found {len(existing_bn)} Bengali translations in backup')
    
    # Match to new Sunnah.com hadiths
    print('\n[Bengali] Matching to new Sunnah.com hadiths...')
    matched = 0
    
    for (book_id, num_in_book), text in existing_bn.items():
        if not book_id or not num_in_book:
            continue
        
        # Find matching new hadith by book_id + num_in_book
        cursor.execute('''
            SELECT id FROM hadiths 
            WHERE book_id = ? AND num_in_book = ? AND source = 'sunnah.com'
        ''', (book_id, num_in_book))
        
        result = cursor.fetchone()
        if result:
            new_hadith_id = result[0]
            
            try:
                cursor.execute('''
                    INSERT OR IGNORE INTO hadith_translations
                        (hadith_id, lang_code, matn_text, translator)
                    VALUES (?, 'bn', ?, 'hadith-api')
                ''', (new_hadith_id, text[:5000]))
                
                if cursor.rowcount > 0:
                    matched += 1
            except Exception as e:
                pass
    
    db.commit()
    print(f'Matched {matched} Bengali translations to new hadiths')
    
    # Also import AI translations (qwen3.5-9b) from backup
    print('\n[Bengali] Importing AI translations...')
    bcursor.execute('''
        SELECT ht.hadith_id, ht.matn_text, ht.lang_code, h.book_id, h.num_in_book
        FROM hadith_translations ht
        JOIN hadiths h ON ht.hadith_id = h.id
        WHERE ht.translator = 'qwen3.5-9b'
    ''')
    
    ai_translations = {}
    for row in bcursor.fetchall():
        old_id, text, lang, book_id, num_in_book = row
        key = (book_id, num_in_book)
        if key not in ai_translations:
            ai_translations[key] = []
        ai_translations[key].append((lang, text))
    
    print(f'Found {len(ai_translations)} AI translations in backup')
    
    ai_matched = 0
    for (book_id, num_in_book), translations in ai_translations.items():
        if not book_id or not num_in_book:
            continue
        
        cursor.execute('''
            SELECT id FROM hadiths 
            WHERE book_id = ? AND num_in_book = ? AND source = 'sunnah.com'
        ''', (book_id, num_in_book))
        
        result = cursor.fetchone()
        if result:
            new_hadith_id = result[0]
            
            for lang, text in translations:
                try:
                    cursor.execute('''
                        INSERT OR IGNORE INTO hadith_translations
                            (hadith_id, lang_code, matn_text, translator)
                        VALUES (?, ?, ?, 'qwen3.5-9b')
                    ''', (new_hadith_id, lang, text[:5000]))
                    
                    if cursor.rowcount > 0:
                        ai_matched += 1
                except Exception as e:
                    pass
    
    db.commit()
    print(f'Matched {ai_matched} AI translations to new hadiths')
    
    db.close()
    backup.close()
    
    print(f'\n[Bengali] Done!')
    print(f'  Bengali (hadith-api): {matched}')
    print(f'  AI (qwen3.5-9b): {ai_matched}')

if __name__ == '__main__':
    main()