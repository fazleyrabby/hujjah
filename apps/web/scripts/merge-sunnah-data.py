#!/usr/bin/env python3
"""
scripts/merge-sunnah-data.py

Phase 1: Parse Sunnah.com SQL dump and merge with existing hadith data
"""

import sqlite3
import re
import sys
import os

DB_PATH = os.getcwd() + '/apps/web/data/hujjah-hadith-core.db'
SUNNAH_SQL_PATH = '/Users/rabbi/Desktop/hujjah resources/sunnah.com/HadithTable.sql'


def map_book_to_collection(book_name_en):
    """Map book name to collection slug"""
    if not book_name_en:
        return None
    
    lower = book_name_en.lower().strip()
    
    if 'ibn majah' in lower: return 'ibnmajah'
    if 'abu dawud' in lower: return 'abudawud'
    if 'an-nasai' in lower or 'nasai' in lower: return 'nasai'
    if 'riyad as-salihin' in lower or 'riyadussalihin' in lower: return 'riyadussalihin'
    if 'hisn al-muslim' in lower or 'hisn' in lower: return 'hisn'
    if 'sahih muslim' in lower or 'muslim' in lower: return 'muslim'
    if 'bukhari' in lower: return 'bukhari'
    if 'tirmidhi' in lower: return 'tirmidhi'
    if 'ahmad' in lower or 'musnad' in lower: return 'ahmad'
    if 'mishkat' in lower: return 'mishkat'
    if 'adab al-mufrad' in lower or 'adab' in lower: return 'adab'
    if 'shamail' in lower: return 'shamail'
    if 'bulugh al-maram' in lower: return 'bulugh'
    if 'forty nawawi' in lower or 'nawawi' in lower: return 'forty'
    
    return None


def parse_arabic_text(arabic_text):
    """Extract matn from arabicText with XML tags"""
    matn_match = re.search(r'\[matn\]([\s\S]*?)\[/matn\]', arabic_text)
    matn = matn_match.group(1).strip() if matn_match else arabic_text
    
    clean_text = re.sub(r'\[narrator[^]]*\]', '', arabic_text)
    clean_text = re.sub(r'\[/narrator\]', '', clean_text)
    clean_text = re.sub(r'\[prematn\]', '', clean_text)
    clean_text = re.sub(r'\[/prematn\]', '', clean_text)
    
    narrator_count = len(re.findall(r'\[narrator', arabic_text))
    
    return {
        'fullText': clean_text.strip(),
        'matn': matn,
        'sanadLength': narrator_count if narrator_count > 0 else 1
    }


print('[Merge] Sunnah.com Data Integration')
print('===================================\n')

# Validate files exist
if not os.path.exists(DB_PATH):
    print('[Merge] ERROR: Database not found at', DB_PATH)
    print('[Merge] Run migrate-sunnah-schema.cjs first')
    sys.exit(1)

if not os.path.exists(SUNNAH_SQL_PATH):
    print('[Merge] ERROR: Sunnah.com SQL dump not found at', SUNNAH_SQL_PATH)
    sys.exit(1)

print('[Merge] Database:', DB_PATH)
print('[Merge] Sunnah SQL:', SUNNAH_SQL_PATH)
print('')

# Open database
db = sqlite3.connect(DB_PATH)
db.execute('PRAGMA journal_mode = WAL')
db.execute('PRAGMA synchronous = NORMAL')
cursor = db.cursor()

# Get current stats
cursor.execute('SELECT COUNT(*) FROM hadiths')
before_hadiths = cursor.fetchone()[0]
cursor.execute('SELECT COUNT(*) FROM hadith_books')
before_books = cursor.fetchone()[0]
cursor.execute('SELECT COUNT(*) FROM hadith_translations')
before_trans = cursor.fetchone()[0]

print('[Merge] Current database stats:')
print(f'  - Hadiths: {before_hadiths:,}')
print(f'  - Books: {before_books:,}')
print(f'  - Translations: {before_trans:,}')
print('')

# Parse Sunnah.com SQL dump - use grep and process line by line
print('[Parse] Reading Sunnah.com SQL dump...')

# Use a simpler approach: find all row patterns with grep-like processing
import subprocess

# Extract rows using grep to find lines starting with (' and count them
result = subprocess.run(
    ['grep', "-oE", r"\('[a-z]+','[0-9]+',", SUNNAH_SQL_PATH],
    capture_output=True, text=True
)
estimated_rows = len(result.stdout.strip().split('\n')) if result.stdout.strip() else 0
print(f'[Parse] Estimated {estimated_rows:,} rows in dump')

# Parse using Python with better memory handling
rows = []
with open(SUNNAH_SQL_PATH, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Find all INSERT blocks
insert_blocks = re.findall(r"INSERT INTO `HadithTable` VALUES\s+(.+?);", content, re.DOTALL)
print(f'[Parse] Found {len(insert_blocks)} INSERT statements')

for block_idx, values_block in enumerate(insert_blocks):
    # Split by row separator
    row_strings = values_block.split("'),(")
    
    for i, row_str in enumerate(row_strings):
        # Clean up
        if i == 0:
            row_str = row_str.lstrip('(').lstrip()
        if i == len(row_strings) - 1:
            row_str = row_str.rstrip(')').rstrip()
        
        # Simple field extraction - split by ',' but handle text fields
        # For now, just extract the first few fields we need for matching
        try:
            # Find collection (first field)
            coll_match = re.match(r"'([^']+)'", row_str)
            if not coll_match:
                continue
            collection = coll_match.group(1)
            
            # Find book number (second field)
            rest = row_str[coll_match.end()+1:]
            book_match = re.match(r"'([^']+)'", rest)
            if not book_match:
                continue
            book_number = book_match.group(1)
            
            # Find hadith number (sixth field) - skip 4 more fields
            for _ in range(4):
                field_match = re.match(r"'([^']*)'|([^,]+),", rest)
                if field_match:
                    rest = rest[field_match.end():].lstrip()
            
            hadith_match = re.match(r"'([^']+)'", rest)
            hadith_number = hadith_match.group(1) if hadith_match else ''
            
            rows.append({
                'collection': collection,
                'bookNumber': book_number,
                'hadithNumber': hadith_number,
                'fullRow': row_str,  # Store for later processing
            })
        except Exception as e:
            continue

print(f'[Parse] Extracted {len(rows):,} hadiths from Sunnah.com\n')

# Group by collection
collection_counts = {}
for row in rows:
    collection_counts[row['collection']] = collection_counts.get(row['collection'], 0) + 1

print('[Merge] Collection breakdown:')
for col, count in sorted(collection_counts.items(), key=lambda x: -x[1]):
    print(f'  - {col}: {count:,}')
print('')

# Map collections to books
print('[Merge] Mapping collections to books...')
book_map = {}

# Get existing books
cursor.execute('SELECT id, name_ar, name_en FROM hadith_books')
for row in cursor.fetchall():
    collection = map_book_to_collection(row[2])
    if collection:
        book_map[collection] = row[0]

# Create missing books
cursor.execute('SELECT collection, name_ar, name_en FROM sunnah_collections')
collections = cursor.fetchall()

for coll_id, coll_ar, coll_en in collections:
    if coll_id not in book_map:
        cursor.execute('INSERT OR IGNORE INTO hadith_books (name_ar, name_en, hadith_count) VALUES (?, ?, 0)',
                      (coll_ar, coll_en))
        db.commit()
        cursor.execute('SELECT id FROM hadith_books WHERE name_ar = ?', (coll_ar,))
        result = cursor.fetchone()
        if result:
            book_map[coll_id] = result[0]
            print(f'  + Created book: {coll_en}')

print(f'[Merge] Mapped {len(book_map)} collections to books\n')

# Prepare SQL statements
def parse_arabic_text(arabic_text):
    """Extract matn from arabicText with XML tags"""
    matn_match = re.search(r'\[matn\]([\s\S]*?)\[/matn\]', arabic_text)
    matn = matn_match.group(1).strip() if matn_match else arabic_text
    
    # Remove XML tags
    clean_text = re.sub(r'\[narrator[^]]*\]', '', arabic_text)
    clean_text = re.sub(r'\[/narrator\]', '', clean_text)
    clean_text = re.sub(r'\[prematn\]', '', clean_text)
    clean_text = re.sub(r'\[/prematn\]', '', clean_text)
    
    # Count narrators
    narrator_count = len(re.findall(r'\[narrator', arabic_text))
    
    return {
        'fullText': clean_text.strip(),
        'matn': matn,
        'sanadLength': narrator_count if narrator_count > 0 else 1
    }

# Merge hadiths
print('[Merge] Merging hadiths...\n')

inserted = 0
updated = 0
skipped = 0
errors = 0

cursor.execute('BEGIN TRANSACTION')

batch_size = 1000
for i in range(0, len(rows), batch_size):
    batch = rows[i:i + batch_size]
    
    for row in batch:
        try:
            book_id = book_map.get(row['collection'])
            if not book_id:
                skipped += 1
                continue
            
            hadith_num = int(row['hadithNumber'].split(',')[0]) if row['hadithNumber'] else row['ourHadithNumber']
            
            # Check by Sunnah.com identifiers
            cursor.execute('''
                SELECT id, sunnah_arabic_urn FROM hadiths 
                WHERE sunnah_collection = ? AND sunnah_book_number = ? AND sunnah_hadith_number = ?
            ''', (row['collection'], row['bookNumber'], row['hadithNumber']))
            existing = cursor.fetchone()
            
            parsed = parse_arabic_text(row['arabicText'])
            
            if existing:
                # Update existing
                cursor.execute('''
                    UPDATE hadiths 
                    SET hadith_ar = ?, matn_ar = ?, sanad_length = ?, source = 'sunnah.com',
                        sunnah_arabic_urn = ?, sunnah_english_urn = ?, grade_ar = ?, grade_en = ?
                    WHERE id = ?
                ''', (parsed['fullText'], parsed['matn'], parsed['sanadLength'],
                      row['arabicURN'], row['englishURN'], row['arabicGrade'], row['englishGrade'],
                      existing[0]))
                updated += 1
                
                # Add English translation
                if row['englishText'] and row['englishText'].strip():
                    cursor.execute('''
                        INSERT OR REPLACE INTO hadith_translations (hadith_id, lang_code, matn_text, translator)
                        VALUES (?, ?, ?, ?)
                    ''', (existing[0], 'en', row['englishText'].strip(), 'sunnah.com'))
            else:
                # Check by book/number
                cursor.execute('SELECT id FROM hadiths WHERE book_id = ? AND num_in_book = ?',
                             (book_id, hadith_num))
                existing_by_num = cursor.fetchone()
                
                if existing_by_num:
                    # Update with metadata
                    cursor.execute('''
                        UPDATE hadiths 
                        SET hadith_ar = ?, matn_ar = ?, sanad_length = ?, source = 'sunnah.com',
                            sunnah_arabic_urn = ?, sunnah_english_urn = ?, grade_ar = ?, grade_en = ?
                        WHERE id = ?
                    ''', (parsed['fullText'], parsed['matn'], parsed['sanadLength'],
                          row['arabicURN'], row['englishURN'], row['arabicGrade'], row['englishGrade'],
                          existing_by_num[0]))
                    updated += 1
                    
                    if row['englishText'] and row['englishText'].strip():
                        cursor.execute('''
                            INSERT OR REPLACE INTO hadith_translations (hadith_id, lang_code, matn_text, translator)
                            VALUES (?, ?, ?, ?)
                        ''', (existing_by_num[0], 'en', row['englishText'].strip(), 'sunnah.com'))
                else:
                    # Insert new
                    cursor.execute('''
                        INSERT INTO hadiths (book_id, num_in_book, hadith_ar, matn_ar, sanad_length, source,
                            sunnah_arabic_urn, sunnah_english_urn, sunnah_collection, sunnah_book_number,
                            sunnah_hadith_number, grade_ar, grade_en)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (book_id, hadith_num, parsed['fullText'], parsed['matn'], parsed['sanadLength'],
                          'sunnah.com', row['arabicURN'], row['englishURN'], row['collection'],
                          row['bookNumber'], row['hadithNumber'], row['arabicGrade'], row['englishGrade']))
                    
                    new_id = cursor.lastrowid
                    inserted += 1
                    
                    cursor.execute('UPDATE hadith_books SET hadith_count = hadith_count + 1 WHERE id = ?', (book_id,))
                    
                    if row['englishText'] and row['englishText'].strip():
                        cursor.execute('''
                            INSERT OR REPLACE INTO hadith_translations (hadith_id, lang_code, matn_text, translator)
                            VALUES (?, ?, ?, ?)
                        ''', (new_id, 'en', row['englishText'].strip(), 'sunnah.com'))
                        
        except Exception as e:
            errors += 1
    
    progress = min(i + batch_size, len(rows))
    print(f'[Merge] Progress: {progress:,} / {len(rows):,} ({progress * 100 // len(rows)}%)')

db.commit()

# Get final stats
cursor.execute('SELECT COUNT(*) FROM hadiths')
after_hadiths = cursor.fetchone()[0]
cursor.execute('SELECT COUNT(*) FROM hadith_books')
after_books = cursor.fetchone()[0]
cursor.execute('SELECT COUNT(*) FROM hadith_translations')
after_trans = cursor.fetchone()[0]

# Summary
print('\n===================================')
print('[Merge] Summary')
print('===================================')
print(f'Inserted: {inserted:,} new hadiths')
print(f'Updated: {updated:,} existing hadiths')
print(f'Skipped: {skipped:,}')
print(f'Errors: {errors:,}')
print('')
print('Database stats:')
print(f'  Before: {before_hadiths:,} hadiths')
print(f'  After:  {after_hadiths:,} hadiths')
print(f'  Change: +{after_hadiths - before_hadiths:,}')
print('')
print('Translations:')
print(f'  Before: {before_trans:,}')
print(f'  After:  {after_trans:,}')
print(f'  Change: +{after_trans - before_trans:,}')
print('')

# Source distribution
cursor.execute('SELECT source, COUNT(*) FROM hadiths GROUP BY source ORDER BY COUNT(*) DESC')
print('Source distribution:')
for source, count in cursor.fetchall():
    print(f'  - {source}: {count:,}')

db.close()
print('\n[Merge] Complete!')


def map_book_to_collection(book_name_en):
    """Map book name to collection slug"""
    if not book_name_en:
        return None
    
    lower = book_name_en.lower().strip()
    
    # Multi-word matches
    if 'ibn majah' in lower:
        return 'ibnmajah'
    if 'abu dawud' in lower:
        return 'abudawud'
    if 'an-nasai' in lower or 'nasai' in lower:
        return 'nasai'
    if 'riyad as-salihin' in lower or 'riyadussalihin' in lower:
        return 'riyadussalihin'
    
    # Muslim distinction
    if 'hisn al-muslim' in lower or 'hisn' in lower:
        return 'hisn'
    if 'sahih muslim' in lower or 'muslim' in lower:
        return 'muslim'
    
    # Single word
    if 'bukhari' in lower:
        return 'bukhari'
    if 'tirmidhi' in lower:
        return 'tirmidhi'
    if 'ahmad' in lower or 'musnad' in lower:
        return 'ahmad'
    if 'mishkat' in lower:
        return 'mishkat'
    if 'adab al-mufrad' in lower or 'adab' in lower:
        return 'adab'
    if 'shamail' in lower:
        return 'shamail'
    if 'bulugh al-maram' in lower:
        return 'bulugh'
    if 'forty nawawi' in lower or 'nawawi' in lower:
        return 'forty'
    
    return None
