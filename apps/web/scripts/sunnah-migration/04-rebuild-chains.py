#!/usr/bin/env python3
"""
scripts/sunnah-migration/04-rebuild-chains.py

Phase 4: Rebuild Narrator Chains from Sunnah.com Data
- Extract [narrator id="X"] from Sunnah.com Arabic text
- Link to existing narrators by name similarity
- Build narrator_edges from chain sequence

Usage: python3 04-rebuild-chains.py
"""

import sqlite3
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent

def connect_db():
    return sqlite3.connect('/Users/rabbi/Desktop/Projects/hujjah/apps/web/data/hujjah-hadith-core.db')

def extract_narrator_data(arabic_text):
    """Extract narrator IDs and names from Sunnah.com text"""
    if not arabic_text:
        return [], []
    
    # Pattern: [narrator id="4698" tooltip="Name"]
    pattern = r'\[narrator id="(\d+)"[^\]]*tooltip="([^"]+)"'
    matches = re.findall(pattern, arabic_text)
    
    narrator_ids = [int(m[0]) for m in matches]
    narrator_names = [m[1] for m in matches]
    
    return narrator_ids, narrator_names

def normalize_name(name):
    """Normalize Arabic name for matching"""
    if not name:
        return ''
    
    # Remove diacritics (tashkeel)
    name = re.sub(r'[\u064B-\u0652]', '', name)
    # Normalize alef
    name = re.sub(r'[إأآا]', 'ا', name)
    # Normalize ya
    name = re.sub(r'[يى]', 'ي', name)
    # Remove non-Arabic
    name = re.sub(r'[^\u0600-\u06FF\s]', '', name)
    # Clean whitespace
    name = ' '.join(name.split())
    
    return name

def main():
    print('[Chains] Starting narrator chain rebuilding...\n')
    
    db = connect_db()
    cursor = db.cursor()
    
    # Get all Sunnah.com hadiths (ordered by collection for batch efficiency)
    print('[Chains] Loading hadiths...')
    cursor.execute('''
        SELECT id, book_id, num_in_book, hadith_ar, sunnah_collection
        FROM hadiths 
        WHERE source = 'sunnah.com'
        ORDER BY book_id, num_in_book
    ''')
    hadiths = cursor.fetchall()
    print(f'Found {len(hadiths)} Sunnah.com hadiths')
    
    # Build narrator ID → name mapping from Sunnah.com IDs
    sunnah_narrator_map = {}  # sunnah_narrator_id → name
    
    print('\n[Chains] Extracting narrator data from Sunnah.com text...')
    narrator_link_count = 0
    edge_count = 0
    
    for hadith_id, book_id, num_in_book, hadith_ar, collection in hadiths:
        narrator_ids, narrator_names = extract_narrator_data(hadith_ar or '')
        
        if not narrator_ids:
            continue
        
        # Store mapping
        for nid, name in zip(narrator_ids, narrator_names):
            if name and name not in sunnah_narrator_map.get(nid, ''):
                if nid not in sunnah_narrator_map:
                    sunnah_narrator_map[nid] = name
        
        # Insert hadith_narrators links
        for position, (nid, name) in enumerate(zip(narrator_ids, narrator_names), 1):
            try:
                cursor.execute('''
                    INSERT OR IGNORE INTO hadith_narrators
                        (hadith_id, narrator_id, position)
                    VALUES (?, ?, ?)
                ''', (hadith_id, nid, position))
                narrator_link_count += cursor.rowcount
            except Exception as e:
                pass  # Skip errors
        
        # Build edges: narrator[i] → narrator[i+1]
        for i in range(len(narrator_ids) - 1):
            try:
                cursor.execute('''
                    INSERT OR IGNORE INTO narrator_edges 
                        (from_narrator_id, to_narrator_id, hadith_count)
                    VALUES (?, ?, 1)
                    ON CONFLICT(from_narrator_id, to_narrator_id) DO UPDATE SET
                        hadith_count = hadith_count + 1
                ''', (narrator_ids[i], narrator_ids[i+1]))
                edge_count += cursor.rowcount
            except Exception as e:
                pass
        
        if (hadith_id % 5000) == 0:
            print(f'  Processed {hadith_id} hadiths...')
    
    db.commit()
    
    print(f'\n[Chains] Extracted {len(sunnah_narrator_map)} unique Sunnah narrator IDs')
    print(f'[Chains] Added {narrator_link_count} narrator links')
    print(f'[Chains] Created/updated {edge_count} narrator edges')
    
    # Get existing narrators for matching
    print('\n[Chains] Matching to existing narrators table...')
    cursor.execute('SELECT id, name_ar FROM narrators')
    existing_narrators = {row[0]: row[1] for row in cursor.fetchall()}
    print(f'Found {len(existing_narrators)} existing narrators')
    
    # Create new narrators for unmapped Sunnah IDs
    print('\n[Chains] Adding new narrators from Sunnah.com...')
    new_narrator_count = 0
    
    for sunnah_id, name in sunnah_narrator_map.items():
        if sunnah_id in existing_narrators:
            continue
        
        # Check if name already exists
        normalized = normalize_name(name)
        match = None
        for eid, ename in existing_narrators.items():
            if normalize_name(ename) == normalized:
                match = eid
                break
        
        if not match:
            # Insert new narrator
            try:
                cursor.execute('''
                    INSERT INTO narrators (id, name_ar, name_normalized)
                    VALUES (?, ?, ?)
                ''', (sunnah_id, name, normalized))
                new_narrator_count += cursor.rowcount
            except Exception as e:
                pass  # ID conflict
    
    db.commit()
    print(f'Added {new_narrator_count} new narrators')
    
    # Final stats
    print('\n[Chains] Final stats:')
    cursor.execute('SELECT COUNT(*) FROM narrators')
    print(f'  Total narrators: {cursor.fetchone()[0]}')
    
    cursor.execute('SELECT COUNT(*) FROM narrator_edges')
    print(f'  Total edges: {cursor.fetchone()[0]}')
    
    cursor.execute('SELECT COUNT(*) FROM hadith_narrators')
    print(f'  Total narrator links: {cursor.fetchone()[0]}')
    
    db.close()
    print('\n[Chains] Done!')

if __name__ == '__main__':
    main()