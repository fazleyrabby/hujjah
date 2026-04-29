const mysql = require('mysql2/promise');
const sqlite3 = require('better-sqlite3');

const hujjahDb = sqlite3('/Users/rabbi/Desktop/Projects/hujjah/apps/web/data/hujjah-hadith-core.db');

const collectionMap = {
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
};

async function main() {
  const mysqli = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    database: 'sunnahdb'
  });

  const [rows] = await mysqli.query(`
    SELECT collection, bookNumber, hadithNumber, ourHadithNumber,
           arabicURN, englishURN, arabicText, englishText,
           arabicgrade1, englishgrade1
    FROM HadithTable
  `);

  console.log(`Got ${rows.length} rows from MySQL`);

  let updated = 0, inserted = 0;

  const stmt = hujjahDb.prepare(`
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
  `);

  for (const row of rows) {
    const bookId = collectionMap[row.collection];
    if (!bookId) continue;

    const numInBook = row.ourHadithNumber;
    if (!numInBook) continue;

    try {
      const result = stmt.run(
        row.arabicText || '',
        row.arabicgrade1 || '',
        row.englishgrade1 || '',
        row.arabicURN,
        row.englishURN,
        row.collection,
        row.bookNumber,
        row.hadithNumber,
        bookId,
        numInBook
      );

      if (result.changes > 0) updated++;
      else inserted++;
    } catch (e) {
      // skip duplicates
    }

    if ((updated + inserted) % 5000 === 0) {
      console.log(`Processed ${updated + inserted}...`);
    }
  }

  console.log(`Done: ${updated} updated, ${inserted} inserted`);
  
  await mysqli.end();
}

main().catch(console.error);