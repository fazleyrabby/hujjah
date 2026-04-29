#!/usr/bin/env python3
"""
scripts/sunnah-migration/06-validate.py

Phase 6: Validate Database Integrity
- Check all expected counts
- Check for orphans
- Report final state

Usage: python3 06-validate.py
"""

import sqlite3

def main():
    print('[Validate] Starting database validation...\n')
    
    db = sqlite3.connect('/Users/rabbi/Desktop/Projects/hujjah/apps/web/data/hujjah-hadith-core.db')
    cursor = db.cursor()
    
    # ===== Total counts =====
    print('[Validate] Database Counts:')
    print('-' * 40)
    
    cursor.execute('SELECT COUNT(*) FROM hadiths')
    print(f'  hadiths: {cursor.fetchone()[0]:,}')
    
    cursor.execute("SELECT source, COUNT(*) FROM hadiths GROUP BY source")
    print('  by source:')
    for row in cursor.fetchall():
        print(f'    {row[0]}: {row[1]:,}')
    
    cursor.execute('SELECT COUNT(*) FROM hadith_translations WHERE lang_code="bn"')
    print(f'  Bengali translations: {cursor.fetchone()[0]:,}')
    
    cursor.execute('SELECT COUNT(*) FROM narrators')
    print(f'  narrators: {cursor.fetchone()[0]:,}')
    
    cursor.execute('SELECT COUNT(*) FROM narrator_edges')
    print(f'  narrator_edges: {cursor.fetchone()[0]:,}')
    
    cursor.execute('SELECT COUNT(*) FROM hadith_narrators')
    print(f'  hadith_narrators: {cursor.fetchone()[0]:,}')
    
    # ===== Collection breakdown =====
    print('\n[Validate] Collection Breakdown:')
    print('-' * 40)
    
    cursor.execute('''
        SELECT hb.name_en, hb.id, COUNT(h.id) as cnt
        FROM hadith_books hb
        LEFT JOIN hadiths h ON hb.id = h.book_id
        WHERE hb.id IN (1688,1689,1444,1648,1652,2014,2015,2016,2017,2018,2019,2020,2021,2022)
        GROUP BY hb.id
        ORDER BY hb.id
    ''')
    
    for row in cursor.fetchall():
        print(f'  {row[0]} ({row[1]}): {row[2]:,} hadiths')
    
    # ===== Check for orphans =====
    print('\n[Validate] Integrity Checks:')
    print('-' * 40)
    
    # Orphaned narrator links
    cursor.execute('''
        SELECT COUNT(*) FROM hadith_narrators
        WHERE narrator_id NOT IN (SELECT id FROM narrators)
    ''')
    orphaned = cursor.fetchone()[0]
    print(f'  Orphaned narrator links: {orphaned}')
    
    # Duplicate hadiths
    cursor.execute('''
        SELECT book_id, num_in_book, COUNT(*) as cnt
        FROM hadiths
        GROUP BY book_id, num_in_book
        HAVING cnt > 1
        ORDER BY cnt DESC
        LIMIT 5
    ''')
    dups = cursor.fetchall()
    if dups:
        print(f'  Duplicate hadiths found: {len(dups)}')
        for d in dups[:5]:
            print(f'    book_id={d[0]}, num={d[1]} count={d[2]}')
    else:
        print(f'  Duplicate hadiths: NONE ✓')
    
    # Check sanad_length populated
    cursor.execute('SELECT COUNT(*) FROM hadiths WHERE sanad_length > 0')
    with_sanad = cursor.fetchone()[0]
    print(f'  Hadiths with sanad_length: {with_sanad:,}')
    
    # Check grading populated
    cursor.execute('SELECT COUNT(*) FROM hadiths WHERE grade_en IS NOT NULL AND grade_en != ""')
    with_grade = cursor.fetchone()[0]
    print(f'  Hadiths with grading: {with_grade:,}')
    
    # ===== Sample hadiths =====
    print('\n[Validate] Sample Data:')
    print('-' * 40)
    
    # Sample hadith
    cursor.execute('''
        SELECT id, book_id, num_in_book, grade_en, sunnah_collection
        FROM hadiths
        WHERE source = 'sunnah.com'
        LIMIT 3
    ''')
    
    print('  Sample hadiths:')
    for row in cursor.fetchall():
        print(f'    id={row[0]}, book={row[1]}, num={row[2]}, grade={row[3]}, coll={row[4]}')
    
    # Sample narrator chain
    cursor.execute('''
        SELECT h.id, h.sanad_length, n.name_ar
        FROM hadiths h
        JOIN hadith_narrators hn ON h.id = hn.hadith_id
        JOIN narrators n ON hn.narrator_id = n.id
        WHERE hn.position = 1
        LIMIT 3
    ''')
    
    print('  Sample narrator links:')
    for row in cursor.fetchall():
        print(f'    hadith={row[0]}, sanad_len={row[1]}, narrator={row[2][:30]}')
    
    db.close()
    
    print('\n[Validate] Validation complete!')

if __name__ == '__main__':
    main()