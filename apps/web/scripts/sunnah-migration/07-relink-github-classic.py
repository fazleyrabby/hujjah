#!/usr/bin/env python3
"""
scripts/sunnah-migration/07-relink-github-classic.py

Re-link github-classic Bengali translations to new Sunnah.com hadiths
using (book_id, num_in_book) matching.

Usage: python3 07-relink-github-classic.py
"""

import sqlite3

def main():
    print('[Relink] Re-linking github-classic translations...\n')
    
    db_path = '/Users/rabbi/Desktop/Projects/hujjah/apps/web/data/hujjah-hadith-core.db'
    db = sqlite3.connect(db_path)
    cursor = db.cursor()
    
    # Get all github-classic translations with their old hadith_id
    cursor.execute('''
        SELECT ht.id, ht.hadith_id, ht.matn_text
        FROM hadith_translations ht
        WHERE ht.translator = 'github-classic' AND ht.lang_code = 'bn'
    ''')
    
    github_translations = cursor.fetchall()
    print(f'Found {len(github_translations)} github-classic translations')
    
    # Get mapping of old hadith_id -> (book_id, num_in_book) from backup
    # But since we don't have backup hadiths anymore, let's check if we can
    # match by book_id + num_in_book from the translations themselves
    
    # First, let's see what hadith_ids the translations reference
    cursor.execute('''
        SELECT DISTINCT ht.hadith_id
        FROM hadith_translations ht
        WHERE ht.translator = 'github-classic' AND ht.lang_code = 'bn'
        LIMIT 10
    ''')
    sample_ids = [r[0] for r in cursor.fetchall()]
    print(f'Sample old hadith_ids: {sample_ids}')
    
    # Check if any of these old hadiths still exist
    cursor.execute('''
        SELECT id, book_id, num_in_book, source FROM hadiths
        WHERE id IN ({})'''.format(','.join('?' * len(sample_ids))), sample_ids)
    
    existing = cursor.fetchall()
    print(f'Of sample IDs, {len(existing)} still exist in hadiths table')
    
    if existing:
        print('Some old hadiths still exist - checking if we need to re-link...')
        return
    
    # The old hadiths are gone. We need to import from backup or re-download.
    # Let's check the backup DB for the mapping
    print('\n[Relink] Old hadiths deleted - need to re-import from backup...')
    print('This requires the backup DB hadiths to map old_id -> (book_id, num_in_book)')
    
    # For now, let's import github-classic translations directly from backup
    # by matching (book_id, num_in_book)
    backup_db = '/Users/rabbi/Desktop/hujjahBackup/hujjah-hadith-core.db'
    backup = sqlite3.connect(backup_db)
    bcursor = backup.cursor()
    
    # Get github-classic translations with their book_id and num_in_book
    bcursor.execute('''
        SELECT ht.matn_text, h.book_id, h.num_in_book
        FROM hadith_translations ht
        JOIN hadiths h ON ht.hadith_id = h.id
        WHERE ht.translator = 'github-classic' AND ht.lang_code = 'bn'
    ''')
    
    to_import = bcursor.fetchall()
    print(f'Found {len(to_import)} github-classic translations in backup')
    
    # Insert into current DB, matching by book_id + num_in_book
    linked = 0
    for text, book_id, num_in_book in to_import:
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
                    VALUES (?, 'bn', ?, 'github-classic')
                ''', (new_hadith_id, text[:5000]))
                
                if cursor.rowcount > 0:
                    linked += 1
            except Exception as e:
                pass
    
    db.commit()
    print(f'Linked {linked} github-classic translations to new hadiths')
    
    # Clean up old orphaned translations
    cursor.execute('''
        DELETE FROM hadith_translations
        WHERE translator = 'github-classic'
        AND hadith_id NOT IN (SELECT id FROM hadiths)
    ''')
    deleted = cursor.rowcount
    db.commit()
    print(f'Deleted {deleted} orphaned github-classic translations')
    
    db.close()
    backup.close()
    
    print('\n[Relink] Done!')

if __name__ == '__main__':
    main()