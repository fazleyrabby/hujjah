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

updated = 0
skipped = 0
batch = []

with open('/tmp/sunnah-export.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f, delimiter='\t')
    for row in reader:
        bookId = collectionMap.get(row['collection'])
        if not bookId:
            skipped += 1
            continue

        numInBook = row.get('ourHadithNumber')
        if not numInBook:
            skipped += 1
            continue

        try:
            batch.append((
                row.get('arabicText', '') or '',
                row.get('arabicgrade1', '') or '',
                row.get('englishgrade1', '') or '',
                row.get('arabicURN') or None,
                row.get('englishURN') or None,
                row['collection'],
                row['bookNumber'],
                row['hadithNumber'],
                bookId,
                int(numInBook)
            ))
        except:
            skipped += 1
            continue

        if len(batch) % 5000 == 0:
            print(f'Read {len(batch)} rows...')

print(f'Total rows: {len(batch)}, skipped: {skipped}')
print('Starting updates...')

for i, params in enumerate(batch):
    try:
        cursor = hujjahDb.cursor()
        cursor.execute('''
            UPDATE hadiths SET
                hadith_ar = ?,
                grade_ar = ?,
                grade_en = ?,
                source = 'sunnah.com',
                sunnah_arabic_urn = ?,
                sunnah_english_urn = ?,
                sunnah_collection = ?,
                sunnah_book_number = ?,
                sunnah_hadith_number = ?
            WHERE book_id = ? AND num_in_book = ?
        ''', params)
        
        if cursor.rowcount > 0:
            updated += 1
    except Exception as e:
        pass

    if (i + 1) % 5000 == 0:
        print(f'Updated {i + 1}...')

hujjahDb.commit()
print(f'Done: {updated} updated, {skipped} skipped')
hujjahDb.close()