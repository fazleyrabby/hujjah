#!/usr/bin/env python3
"""
scripts/sunnah-migration/01-export-backup.py

Phase 1: Export Critical Data from Current DB
- Narrator chains (hadith_narrators links)
- AI translations (translator = 'qwen3.5-9b')
- Embeddings metadata
- Narrator edges

Output:
- exports/narrators.csv - narrator_id, name_ar, tabaqah
- exports/hadith_narrators.csv - hadith_id, narrator_id, position  
- exports/narrator_edges.csv - from_narrator_id, to_narrator_id
- exports/ai_translations.csv - hadith_id, lang_code, matn_text
"""

import sqlite3
import csv
import os
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
EXPORT_DIR = SCRIPT_DIR / 'exports'
EXPORT_DIR.mkdir(exist_ok=True)

DB_PATH = '/Users/rabbi/Desktop/Projects/hujjah/apps/web/data/hujjah-hadith-core.db'
BACKUP_DB = '/Users/rabbi/Desktop/hujjahBackup/hujjah-hadith-core.db'

def export_table(db, table_name, csv_path, columns='*'):
    """Export table to CSV"""
    cursor = db.cursor()
    cursor.execute(f'SELECT {columns} FROM {table_name}')
    rows = cursor.fetchall()
    
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        # Write header
        cursor.execute(f'PRAGMA table_info({table_name})')
        cols = [col[1] for col in cursor.fetchall()]
        writer.writerow(cols)
        # Write data
        writer.writerows(rows)
    
    print(f'Exported {len(rows)} rows from {table_name} → {csv_path.name}')

def main():
    print('[Export] Starting backup data export...\n')
    
    # Try current DB first, fallback to backup
    db_path = DB_PATH if os.path.exists(DB_PATH) else BACKUP_DB
    print(f'[Export] Using DB: {db_path}')
    
    db = sqlite3.connect(db_path)
    
    # 1. Export narrators
    print('\n[1/4] Exporting narrators...')
    export_table(db, 'narrators', EXPORT_DIR / 'narrators.csv')
    
    # 2. Export hadith_narrators links
    print('\n[2/4] Exporting hadith_narrators...')
    export_table(db, 'hadith_narrators', EXPORT_DIR / 'hadith_narrators.csv')
    
    # 3. Export narrator_edges
    print('\n[3/4] Exporting narrator_edges...')
    export_table(db, 'narrator_edges', EXPORT_DIR / 'narrator_edges.csv')
    
    # 4. Export AI translations only (not human Bengali from hadith-api)
    print('\n[4/4] Exporting AI translations (qwen3.5-9b)...')
    cursor = db.cursor()
    cursor.execute('''
        SELECT ht.id, ht.hadith_id, ht.lang_code, ht.matn_text, ht.translator
        FROM hadith_translations ht
        WHERE ht.translator = 'qwen3.5-9b'
    ''')
    rows = cursor.fetchall()
    
    with open(EXPORT_DIR / 'ai_translations.csv', 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'hadith_id', 'lang_code', 'matn_text', 'translator'])
        writer.writerows(rows)
    
    print(f'Exported {len(rows)} AI translations')
    
    # 5. Export hadith_id → sunnah_collection mapping for matching later
    print('\n[Extra] Exporting hadith_id → source mapping...')
    cursor = db.cursor()
    cursor.execute('''
        SELECT id, book_id, num_in_book, source, sunnah_collection, sunnah_hadith_number
        FROM hadiths 
        WHERE sunnah_collection IS NOT NULL
    ''')
    rows = cursor.fetchall()
    
    with open(EXPORT_DIR / 'hadith_source_map.csv', 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'book_id', 'num_in_book', 'source', 'sunnah_collection', 'sunnah_hadith_number'])
        writer.writerows(rows)
    
    print(f'Exported {len(rows)} hadiths with Sunnah mapping')
    
    db.close()
    
    print(f'\n[Export] Done! Files in {EXPORT_DIR}')
    print(f'  - narrators.csv')
    print(f'  - hadith_narrators.csv')
    print(f'  - narrator_edges.csv')
    print(f'  - ai_translations.csv')
    print(f'  - hadith_source_map.csv')

if __name__ == '__main__':
    main()