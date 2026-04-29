#!/usr/bin/env python3
"""
Convert Sunnah.com MySQL dump to SQLite compatible format
"""

import re
import sys

INPUT_FILE = '/Users/rabbi/Desktop/hujjah resources/sunnah.com/HadithTable.sql'
OUTPUT_FILE = '/Users/rabbi/Desktop/hujjah resources/sunnah.com/sunnah_sqlite.sql'

print('[Convert] MySQL → SQLite format')
print('Input:', INPUT_FILE)
print('Output:', OUTPUT_FILE)
print()

with open(INPUT_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove MySQL-specific syntax
content = re.sub(r'ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;', ';', content)
content = re.sub(r'/\*!.*?\*/', '', content)  # Remove MySQL comments
content = re.sub(r'LOCK TABLES.*?WRITE;', '', content)  # Remove LOCK
content = re.sub(r'UNLOCK TABLES;', '', content)
content = re.sub(r'DROP TABLE IF EXISTS.*?;', '', content)  # Remove DROP

# Create table with SQLite syntax
create_table = '''
CREATE TABLE IF NOT EXISTS HadithTable (
  collection TEXT NOT NULL,
  bookNumber TEXT NOT NULL,
  babID REAL NOT NULL,
  englishBabNumber TEXT,
  arabicBabNumber TEXT,
  hadithNumber TEXT NOT NULL,
  ourHadithNumber INTEGER NOT NULL,
  arabicURN INTEGER NOT NULL PRIMARY KEY,
  arabicBabName TEXT,
  arabicText TEXT,
  arabicgrade1 TEXT NOT NULL,
  englishURN INTEGER NOT NULL,
  englishBabName TEXT,
  englishText TEXT,
  englishgrade1 TEXT NOT NULL,
  last_updated TEXT,
  xrefs TEXT NOT NULL
);
'''

# Find all INSERT statements and convert to SQLite format
print('[Convert] Processing INSERT statements...')

# Extract all values from INSERT statements
insert_pattern = r"INSERT INTO `HadithTable` VALUES\s+(.+?);"
matches = re.findall(insert_pattern, content, re.DOTALL)

print(f'    Found {len(matches)} INSERT blocks')

# Write output
with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    f.write('-- Sunnah.com data converted for SQLite\n')
    f.write(create_table)
    f.write('\nBEGIN TRANSACTION;\n')
    
    # Write all INSERT statements for SQLite
    for match in matches:
        f.write(f'INSERT INTO HadithTable VALUES {match};\n')
    
    f.write('COMMIT;\n')

print(f'    Output written to {OUTPUT_FILE}')

# Verify
import subprocess
result = subprocess.run(['wc', '-l', OUTPUT_FILE], capture_output=True, text=True)
print(f'    Lines: {result.stdout.strip()}')

print('\n[Convert] Complete!')
