#!/usr/bin/env python3
"""
scripts/test-sunnah-parse.py - V3

Streaming line-by-line parser for memory efficiency
"""

import sqlite3
import os
from collections import Counter

SUNNAH_SQL_PATH = '/Users/rabbi/Desktop/hujjah resources/sunnah.com/HadithTable.sql'
DB_PATH = os.getcwd() + '/apps/web/data/hujjah-hadith-core.db'

print('[Test] Sunnah.com Parse V3 - Streaming')
print('=======================================\n')

# Stream file line by line
print('[1] Streaming SQL dump line by line...')

rows = []
current_row = ''
in_row = False
row_count = 0
target = 100

with open(SUNNAH_SQL_PATH, 'r', encoding='utf-8', errors='ignore') as f:
    for line_num, line in enumerate(f, 1):
        line = line.strip()
        
        # Skip header
        if line.startswith('INSERT INTO'):
            in_row = True
            # Get content after VALUES (
            if 'VALUES' in line:
                idx = line.find('VALUES')
                current_row = line[idx+6:].lstrip(' (')
            continue
        
        if not in_row or row_count >= target:
            continue
        
        # Accumulate line
        current_row += line
        
        # Check if row complete (ends with ), or );)
        if current_row.endswith('),') or current_row.endswith(');'):
            # Remove trailing ), or );
            clean = current_row.rstrip(';').rstrip(')').rstrip(',')
            
            # Parse fields - split by ',' but handle quoted text
            fields = []
            current = ''
            in_string = False
            
            for char in clean:
                if char == "'" and (not current or current[-1] != '\\'):
                    in_string = not in_string
                    current += char
                elif char == ',' and not in_string:
                    fields.append(current.strip("'"))
                    current = ''
                else:
                    current += char
            fields.append(current.strip("'"))
            
            if len(fields) >= 17:
                try:
                    rows.append({
                        'collection': fields[0],
                        'bookNumber': fields[1],
                        'hadithNumber': fields[5],
                        'arabicURN': fields[7],
                        'englishURN': fields[11],
                        'arabicGrade': fields[10],
                        'englishGrade': fields[14],
                        'arabicText': fields[9],
                        'englishText': fields[13],
                    })
                    row_count += 1
                    if row_count % 20 == 0:
                        print(f'    Parsed {row_count} rows...')
                except Exception as e:
                    pass
            
            current_row = ''
            
            if current_row.endswith(');'):
                in_row = False

print(f'    Total parsed: {len(rows)} rows\n')

if rows:
    print('[2] Sample rows:')
    for i, row in enumerate(rows[:5]):
        print(f'    {i+1}. {row["collection"]}/{row["bookNumber"]}/{row["hadithNumber"]} ' +
              f'(URN:{row["arabicURN"]}, Grade:{row["arabicGrade"]})')
    
    print(f'\n[3] Collection breakdown:')
    coll_counts = Counter(r['collection'] for r in rows)
    for coll, count in coll_counts.most_common(10):
        print(f'    {coll}: {count}')
    
    print(f'\n[4] Text analysis (first row):')
    sample = rows[0]
    print(f'    Arabic: {len(sample["arabicText"]):,} chars')
    print(f'    English: {len(sample["englishText"]):,} chars')

# Database test
print(f'\n[5] Database check...')
if os.path.exists(DB_PATH):
    db = sqlite3.connect(DB_PATH)
    cursor = db.cursor()
    
    cursor.execute("PRAGMA table_info(hadiths)")
    cols = [c[1] for c in cursor.fetchall()]
    
    required = ['source', 'sunnah_arabic_urn', 'sunnah_collection', 'grade_ar', 'grade_en']
    missing = [c for c in required if c not in cols]
    
    if missing:
        print(f'    ⚠ Missing columns: {missing}')
        print('    Run: node apps/web/scripts/migrate-sunnah-schema.cjs')
    else:
        print('    ✓ Schema ready')
        
        cursor.execute("SELECT COUNT(*) FROM hadiths")
        total = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM hadiths WHERE source = 'sunnah.com'")
        sunnah = cursor.fetchone()[0]
        
        print(f'    Total hadiths: {total:,}')
        print(f'    From sunnah.com: {sunnah:,}')
    
    db.close()
else:
    print('    ERROR: DB not found')

print('\n[Test] Complete!')
