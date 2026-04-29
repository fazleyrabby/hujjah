import csv
import sqlite3

hujjahDb = sqlite3.connect('/Users/rabbi/Desktop/Projects/hujjah/apps/web/data/hujjah-hadith-core.db')

collectionMap = {
    'bukhari': 1688, 'muslim': 1689, 'tirmidhi': 1444, 'abudawud': 1648, 'ibnmajah': 1652,
    'nasai': 2014, 'ahmad': 2015, 'mishkat': 2016, 'riyadussalihin': 2017,
    'adab': 2018, 'shamail': 2019, 'bulugh': 2020, 'hisn': 2021, 'forty': 2022
}

# Get existing books (id >= 2014 but empty)
cursor = hujjahDb.cursor()
cursor.execute('SELECT id FROM hadith_books WHERE id >= 2014')
existingBooks = {row[0] for row in cursor.fetchall()}

print(f'New books to populate: {sorted(existingBooks)}')

# Read CSV and group by collection
batch = {}
with open('/tmp/sunnah-export.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f, delimiter='\t')
    for row in reader:
        bookId = collectionMap.get(row['collection'])
        if bookId and bookId in existingBooks:
            if bookId not in batch:
                batch[bookId] = []
            batch[bookId].append(row)

for bookId, rows in batch.items():
    print(f'Book {bookId}: {len(rows)} rows')

# Insert sequentially for each book
for bookId, rows in batch.items():
    cursor = hujjahDb.cursor()
    inserted = 0
    for i, row in enumerate(rows):
        try:
            # 13 values: book_id, num_in_book, hadith_ar, matn_ar, sanad_length, source, 
            #           sunnah_arabic_urn, sunnah_english_urn, sunnah_collection, 
            #           sunnah_book_number, sunnah_hadith_number, grade_ar, grade_en
            cursor.execute('''
                INSERT INTO hadiths 
                    (book_id, num_in_book, hadith_ar, matn_ar, sanad_length, source, 
                     sunnah_arabic_urn, sunnah_english_urn, sunnah_collection, 
                     sunnah_book_number, sunnah_hadith_number, grade_ar, grade_en)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                bookId,
                i + 1,
                row.get('arabicText', '')[:5000] if row.get('arabicText') else '',
                '',
                0,
                'sunnah.com',
                int(row['arabicURN']) if row.get('arabicURN') and row['arabicURN'].isdigit() else None,
                int(row['englishURN']) if row.get('englishURN') and row['englishURN'].isdigit() else None,
                row['collection'],
                row['bookNumber'],
                row['hadithNumber'],
                (row.get('arabicgrade1', '') or '')[:200],
                (row.get('englishgrade1', '') or '')[:200]
            ))
            inserted += 1
        except Exception as e:
            if inserted < 3:
                print(f'Error at {i}: {e}')
            pass
    
    print(f'Book {bookId}: inserted {inserted}')
    hujjahDb.commit()

hujjahDb.close()
print('Done')