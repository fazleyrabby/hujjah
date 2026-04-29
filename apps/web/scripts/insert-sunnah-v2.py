import csv
import sqlite3

hujjahDb = sqlite3.connect('/Users/rabbi/Desktop/Projects/hujjah/apps/web/data/hujjah-hadith-core.db')

collectionMap = {
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

cursor = hujjahDb.cursor()
cursor.execute('SELECT book_id, COUNT(*) FROM hadiths GROUP BY book_id')
existingCounts = {row[0]: row[1] for row in cursor.fetchall()}
print(f'Existing counts: {existingCounts}')

newBooks = {2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022}

batch = []
skipped = 0

with open('/tmp/sunnah-export.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f, delimiter='\t')
    for row in reader:
        bookId = collectionMap.get(row['collection'])
        if not bookId or bookId not in newBooks:
            skipped += 1
            continue
        if not row.get('ourHadithNumber'):
            skipped += 1
            continue
        batch.append((bookId, row,))
        if len(batch) % 5000 == 0:
            print(f'Read {len(batch)} rows...')

from collections import defaultdict
byCollection = defaultdict(list)
for bookId, row in batch:
    byCollection[bookId].append(row)

print(f'Total new rows: {len(batch)}, skipped: {skipped}')

inserted = 0
for bookId, rows in byCollection.items():
    startNum = 1
    cursor = hujjahDb.cursor()
    for i, row in enumerate(rows):
        try:
            cursor.execute('''
                INSERT INTO hadiths 
                    (book_id, num_in_book, hadith_ar, matn_ar, sanad_length, source, 
                     sunnah_arabic_urn, sunnah_english_urn, sunnah_collection, 
                     sunnah_book_number, sunnah_hadith_number, grade_ar, grade_en)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                bookId,
                startNum + i,
                row.get('arabicText', '') or '',
                '',
                0,
                'sunnah.com',
                row.get('arabicURN') or None,
                row.get('englishURN') or None,
                row['collection'],
                row['bookNumber'],
                row['hadithNumber'],
                row.get('arabicgrade1', '') or '',
                row.get('englishgrade1', '') or ''
            ))
            inserted += 1
        except Exception as e:
            print(f'Error: {e}')
    print(f'Book {bookId}: inserted {len(rows)}')

hujjahDb.commit()
print(f'Done: {inserted} inserted')
hujjahDb.close()