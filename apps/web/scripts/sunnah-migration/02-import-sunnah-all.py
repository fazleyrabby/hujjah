#!/usr/bin/env python3
"""
scripts/sunnah-migration/02-import-sunnah-all.py

Phase 2: Import ALL Sunnah.com Hadiths
- 14 collections, 42,694 total
- Import from MySQL sunnahdb
- Assign sequential num_in_book per collection
- Store Arabic text, grading, URN references

Usage: python3 02-import-sunnah-all.py
"""

import pymysql
import sqlite3
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
EXPORT_DIR = SCRIPT_DIR / 'exports'

# Collection mapping: sunnah.com → Hujjah book_id
COLLECTION_MAP = {
    'bukhari': 1688,
    'muslim': 1689,
    'tirmidhi': 1444,
    'abudawud': 1648,
    'ibnmajah': 1652,
    'nasai': 2014,
    'ahmad': 2015,
    'mishkat': 2016,
    'riyadussalihin': 2017,
    'adab': 2018,
    'shamail': 2019,
    'bulugh': 2020,
    'hisn': 2021,
    'forty': 2022
}

def connect_mysql():
    """Connect to MySQL sunnahdb"""
    return pymysql.connect(
        host='localhost',
        user='root',
        database='sunnahdb'
    )

def clean_arabic_text(text):
    """Clean Arabic text - remove narrator tags, preserve text"""
    if not text:
        return ''
    
    # Remove [prematn] and [/prematn]
    text = re.sub(r'\[prematn\]', '', text)
    text = re.sub(r'\[/prematn\]', '', text)
    
    # Remove [matn] and [/matn]
    text = re.sub(r'\[matn\]', '', text)
    text = re.sub(r'\[/matn\]', '', text)
    
    # Remove [narrator id="X" tooltip="Name"] and [/narrator]
    text = re.sub(r'\[narrator id="\d+"[^\]]*\]', '', text)
    text = re.sub(r'\[/narrator\]', '', text)
    
    # Clean up extra whitespace
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()
    
    return text

def extract_narrator_ids(text):
    """Extract narrator IDs from Sunnah.com hadith text"""
    if not text:
        return []
    
    pattern = r'\[narrator id="(\d+)"'
    matches = re.findall(pattern, text)
    return [int(m) for m in matches]

def main():
    print('[Import] Starting Sunnah.com import...\n')
    
    # Connect to databases
    mysql_conn = connect_mysql()
    db_path = '/Users/rabbi/Desktop/Projects/hujjah/apps/web/data/hujjah-hadith-core.db'
    sqlite_conn = sqlite3.connect(db_path)
    
    # Clear existing hadiths for the 14 collections
    print('[Import] Clearing existing hadiths for 14 collections...')
    cursor = sqlite_conn.cursor()
    cursor.execute('''
        DELETE FROM hadiths 
        WHERE book_id IN (1688,1689,1444,1648,1652,2014,2015,2016,2017,2018,2019,2020,2021,2022)
    ''')
    sqlite_conn.commit()
    print(f'Deleted {cursor.rowcount} hadiths')
    
    # Also clear narrator links for these books (need to re-map)
    cursor.execute('''
        DELETE FROM hadith_narrators 
        WHERE hadith_id IN (
            SELECT id FROM hadiths 
            WHERE book_id IN (1688,1689,1444,1648,1652,2014,2015,2016,2017,2018,2019,2020,2021,2022)
        )
    ''')
    sqlite_conn.commit()
    print(f'Deleted {cursor.rowcount} hadith_narrators links')
    
# Import each collection
    total_imported = 0
    narrator_link_count = 0
    
    mysql_cursor = mysql_conn.cursor(pymysql.cursors.DictCursor)
    
    for collection, book_id in COLLECTION_MAP.items():
        print(f'\n[Import] Processing {collection} (book_id={book_id})...')
        
        # Fetch all hadiths for this collection - ORDERED by ourHadithNumber
        mysql_cursor.execute('''
            SELECT collection, bookNumber, hadithNumber, ourHadithNumber,
                   arabicURN, englishURN, arabicText, englishText,
                   arabicgrade1, englishgrade1
            FROM HadithTable
            WHERE collection = %s
            ORDER BY ourHadithNumber, bookNumber, hadithNumber
        ''', (collection,))
        
        rows = list(mysql_cursor.fetchall())
        print(f'  Found {len(rows)} rows in MySQL, inserting ALL as separate hadiths...')
        
        # Insert EACH ROW as a separate hadith (no grouping!)
        inserted = 0
        num_in_book = 1  # Start from 1, auto-increment for duplicates
        
        for row in rows:
            clean_text = clean_arabic_text(row['arabicText'])
            narrator_ids = extract_narrator_ids(row['arabicText'] or '')
            
            try:
                cursor.execute('''
                    INSERT INTO hadiths (
                        book_id, num_in_book, hadith_ar, matn_ar, sanad_length,
                        source, sunnah_arabic_urn, sunnah_english_urn,
                        sunnah_collection, sunnah_book_number, sunnah_hadith_number,
                        grade_ar, grade_en
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    book_id,
                    num_in_book,
                    clean_text[:10000] if clean_text else '',
                    '',
                    len(narrator_ids),
                    'sunnah.com',
                    row['arabicURN'],
                    row['englishURN'],
                    collection,
                    str(row['bookNumber']),
                    str(row['hadithNumber']),
                    (row['arabicgrade1'] or '')[:200],
                    (row['englishgrade1'] or '')[:200]
                ))
                
                num_in_book += 1
                inserted += 1
            except sqlite3.IntegrityError:
                # Duplicate num_in_book - skip this hadith (keep it from first pass above)
                pass
        
        sqlite_conn.commit()
        print(f'  Inserted {inserted} hadiths')
        total_imported += inserted
    
    print(f'\n[Import] Total: {total_imported} hadiths, {narrator_link_count} narrator track')
    
    mysql_conn.close()
    sqlite_conn.close()
    
    print('\n[Import] Done!')

if __name__ == '__main__':
    main()