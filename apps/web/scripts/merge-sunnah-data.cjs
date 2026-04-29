#!/usr/bin/env node
/**
 * scripts/merge-sunnah-data.cjs
 * 
 * Phase 1: Parse Sunnah.com SQL dump and merge with existing hadith data
 * - Preserves existing Bengali translations
 * - Adds Sunnah.com hadiths with source='sunnah.com'
 * - Updates existing hadiths with Sunnah.com grading
 * - Deduplicates by (collection, bookNumber, hadithNumber)
 * 
 * Usage: node apps/web/scripts/merge-sunnah-data.cjs
 */

const Database = require('better-sqlite3');
const fs = require('fs');

const DB_PATH = process.cwd() + '/apps/web/data/hujjah-hadith-core.db';
const SUNNAH_SQL_PATH = '/Users/rabbi/Desktop/hujjah resources/sunnah.com/HadithTable.sql';

console.log('[Merge] Sunnah.com Data Integration');
console.log('===================================\n');

// Validate files exist
if (!fs.existsSync(DB_PATH)) {
  console.error('[Merge] ERROR: Database not found at', DB_PATH);
  console.error('[Merge] Run migrate-sunnah-schema.cjs first');
  process.exit(1);
}

if (!fs.existsSync(SUNNAH_SQL_PATH)) {
  console.error('[Merge] ERROR: Sunnah.com SQL dump not found at', SUNNAH_SQL_PATH);
  process.exit(1);
}

console.log('[Merge] Database:', DB_PATH);
console.log('[Merge] Sunnah SQL:', SUNNAH_SQL_PATH);
console.log('');

// Open database with read-write
const db = new Database(DB_PATH, { readonly: false });
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Get current stats
const beforeStats = {
  hadiths: db.prepare('SELECT COUNT(*) as count FROM hadiths').get().count,
  books: db.prepare('SELECT COUNT(*) as count FROM hadith_books').get().count,
  translations: db.prepare('SELECT COUNT(*) as count FROM hadith_translations').get().count,
};

console.log('[Merge] Current database stats:');
console.log(`  - Hadiths: ${beforeStats.hadiths}`);
console.log(`  - Books: ${beforeStats.books}`);
console.log(`  - Translations: ${beforeStats.translations}`);
console.log('');

// Parse Sunnah.com SQL dump using line-by-line approach
console.log('[Parse] Reading Sunnah.com SQL dump...');

const rows = [];
let currentRow = '';
let inRow = false;

const fileContent = fs.readFileSync(SUNNAH_SQL_PATH, 'utf8');
const lines = fileContent.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  // Skip header lines
  if (line.startsWith('INSERT INTO')) {
    inRow = true;
    // Extract start of values if on same line
    const match = line.match(/VALUES\s*\((.+)$/);
    if (match) {
      currentRow = match[1];
    }
    continue;
  }
  
  if (!inRow) continue;
  
  // Accumulate lines until we find a complete row
  currentRow += line;
  
  // Check if row ends with ), or );
  if (currentRow.endsWith('),') || currentRow.endsWith(');')) {
    // Remove trailing ), or );
    const cleanRow = currentRow.replace(/,\s*$/, '').replace(/;\s*$/, '');
    
    // Parse this row
    const fields = parseSQLRow(cleanRow);
    if (fields && fields.length >= 17) {
      rows.push({
        collection: fields[0],
        bookNumber: fields[1],
        babID: fields[2],
        englishBabNumber: fields[3] || '',
        arabicBabNumber: fields[4] || '',
        hadithNumber: fields[5],
        ourHadithNumber: parseInt(fields[6]) || 0,
        arabicURN: parseInt(fields[7]) || 0,
        arabicBabName: fields[8] || '',
        arabicText: fields[9] || '',
        arabicGrade: fields[10] || '',
        englishURN: parseInt(fields[11]) || 0,
        englishBabName: fields[12] || '',
        englishText: fields[13] || '',
        englishGrade: fields[14] || '',
        lastUpdated: fields[15] || '',
        xrefs: fields[16] || '',
      });
    }
    
    currentRow = '';
    
    // Check if this was the last row
    if (currentRow.endsWith(');')) {
      inRow = false;
    }
  } else if (!line.endsWith(',')) {
    // Row continues on next line
    currentRow += '\n';
  }
}

console.log(`[Parse] Successfully parsed ${rows.length.toLocaleString()} hadiths from Sunnah.com\n`);

if (rows.length === 0) {
  console.error('[Parse] ERROR: No rows parsed. Check SQL dump format.');
  process.exit(1);
}

// Group by collection for book mapping
const collectionCounts = {};
for (const row of rows) {
  collectionCounts[row.collection] = (collectionCounts[row.collection] || 0) + 1;
}

console.log('[Merge] Collection breakdown:');
Object.entries(collectionCounts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([col, count]) => {
    console.log(`  - ${col}: ${count.toLocaleString()}`);
  });
console.log('');

// Map Sunnah.com collections to hadith_books
console.log('[Merge] Mapping collections to books...');
const bookMap = new Map();

// Get existing books
const existingBooks = db.prepare('SELECT id, name_ar, name_en FROM hadith_books').all();
for (const book of existingBooks) {
  const collection = mapBookToCollection(book.name_en);
  if (collection) {
    bookMap.set(collection, book.id);
  }
}

// Create missing books
const insertBook = db.prepare('INSERT OR IGNORE INTO hadith_books (name_ar, name_en, hadith_count) VALUES (?, ?, 0)');
const collections = db.prepare('SELECT collection, name_ar, name_en FROM sunnah_collections').all();

for (const coll of collections) {
  if (!bookMap.has(coll.collection)) {
    const result = insertBook.run(coll.name_ar, coll.name_en);
    bookMap.set(coll.collection, result.lastInsertId);
    console.log(`  + Created book: ${coll.name_en}`);
  }
}

console.log(`[Merge] Mapped ${bookMap.size} collections to books\n`);

// Prepare SQL statements
const getHadithBySunnahInfo = db.prepare(`
  SELECT id, sunnah_arabic_urn 
  FROM hadiths 
  WHERE sunnah_collection = ? AND sunnah_book_number = ? AND sunnah_hadith_number = ?
`);

const getHadithByBookNumber = db.prepare(`
  SELECT id FROM hadiths 
  WHERE book_id = ? AND num_in_book = ?
`);

const insertHadith = db.prepare(`
  INSERT INTO hadiths (book_id, num_in_book, hadith_ar, matn_ar, sanad_length, source, sunnah_arabic_urn, sunnah_english_urn, sunnah_collection, sunnah_book_number, sunnah_hadith_number, grade_ar, grade_en)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateHadith = db.prepare(`
  UPDATE hadiths 
  SET hadith_ar = ?, matn_ar = ?, sanad_length = ?, source = 'sunnah.com', 
      sunnah_arabic_urn = ?, sunnah_english_urn = ?, grade_ar = ?, grade_en = ?
  WHERE id = ?
`);

const insertTranslation = db.prepare(`
  INSERT OR REPLACE INTO hadith_translations (hadith_id, lang_code, matn_text, translator)
  VALUES (?, ?, ?, ?)
`);

const updateBookCount = db.prepare('UPDATE hadith_books SET hadith_count = hadith_count + 1 WHERE id = ?');

// Parse arabicText to extract sanad and matn
function parseArabicText(arabicText) {
  // Extract matn from [matn]...[/matn] tags
  const matnMatch = arabicText.match(/\[matn\]([\s\S]*?)\[\/matn\]/);
  const matn = matnMatch ? matnMatch[1].trim() : arabicText;
  
  // Remove XML-like narrator tags for clean text
  const cleanText = arabicText.replace(/\[narrator[^]]*\]/g, '').replace(/\[\/narrator\]/g, '').replace(/\[prematn\]/g, '').replace(/\[\/prematn\]/g, '').trim();
  
  // Estimate sanad length (count narrator markers)
  const narratorCount = (arabicText.match(/\[narrator/g) || []).length;
  
  return {
    fullText: cleanText,
    matn: matn,
    sanadLength: narratorCount > 0 ? narratorCount : 1
  };
}

// Merge hadiths
console.log('[Merge] Merging hadiths...\n');

let inserted = 0;
let updated = 0;
let skipped = 0;
let errors = 0;

db.exec('BEGIN TRANSACTION');

const batchSize = 1000;
for (let i = 0; i < rows.length; i += batchSize) {
  const batch = rows.slice(i, i + batchSize);
  
  for (const row of batch) {
    try {
      const bookId = bookMap.get(row.collection);
      if (!bookId) {
        skipped++;
        continue;
      }
      
      const hadithNum = parseInt(row.hadithNumber.split(',')[0]) || row.ourHadithNumber;
      
      // Check if we already have this hadith by Sunnah.com identifiers
      const existing = getHadithBySunnahInfo.get(row.collection, row.bookNumber, row.hadithNumber);
      
      const parsed = parseArabicText(row.arabicText);
      
      if (existing) {
        // Update existing hadith with Sunnah.com data
        updateHadith.run(
          parsed.fullText,
          parsed.matn,
          parsed.sanadLength,
          row.arabicURN,
          row.englishURN,
          row.arabicGrade,
          row.englishGrade,
          existing.id
        );
        updated++;
        
        // Add English translation from Sunnah.com (preserve Bengali)
        if (row.englishText && row.englishText.trim()) {
          insertTranslation.run(existing.id, 'en', row.englishText.trim(), 'sunnah.com');
        }
      } else {
        // Check if we have this hadith by book/number
        const existingByNumber = getHadithByBookNumber.get(bookId, hadithNum);
        
        if (existingByNumber) {
          // Update with Sunnah.com metadata
          updateHadith.run(
            parsed.fullText,
            parsed.matn,
            parsed.sanadLength,
            row.arabicURN,
            row.englishURN,
            row.arabicGrade,
            row.englishGrade,
            existingByNumber.id
          );
          updated++;
          
          // Add English translation
          if (row.englishText && row.englishText.trim()) {
            insertTranslation.run(existingByNumber.id, 'en', row.englishText.trim(), 'sunnah.com');
          }
        } else {
          // Insert new hadith
          const result = insertHadith.run(
            bookId,
            hadithNum,
            parsed.fullText,
            parsed.matn,
            parsed.sanadLength,
            'sunnah.com',
            row.arabicURN,
            row.englishURN,
            row.collection,
            row.bookNumber,
            row.hadithNumber,
            row.arabicGrade,
            row.englishGrade
          );
          inserted++;
          updateBookCount.run(bookId);
          
          // Add English translation
          if (row.englishText && row.englishText.trim()) {
            insertTranslation.run(result.lastInsertId, 'en', row.englishText.trim(), 'sunnah.com');
          }
        }
      }
    } catch (err) {
      errors++;
    }
  }
  
  console.log(`[Merge] Progress: ${Math.min(i + batchSize, rows.length).toLocaleString()} / ${rows.length.toLocaleString()} (${Math.round((i + batchSize) / rows.length * 100)}%)`);
}

db.exec('COMMIT TRANSACTION');

// Get final stats
const afterStats = {
  hadiths: db.prepare('SELECT COUNT(*) as count FROM hadiths').get().count,
  books: db.prepare('SELECT COUNT(*) as count FROM hadith_books').get().count,
  translations: db.prepare('SELECT COUNT(*) as count FROM hadith_translations').get().count,
};

// Summary
console.log('\n===================================');
console.log('[Merge] Summary');
console.log('===================================');
console.log(`Inserted: ${inserted.toLocaleString()} new hadiths`);
console.log(`Updated: ${updated.toLocaleString()} existing hadiths`);
console.log(`Skipped: ${skipped.toLocaleString()}`);
console.log(`Errors: ${errors.toLocaleString()}`);
console.log('');
console.log('Database stats:');
console.log(`  Before: ${beforeStats.hadiths.toLocaleString()} hadiths`);
console.log(`  After:  ${afterStats.hadiths.toLocaleString()} hadiths`);
console.log(`  Change: +${(afterStats.hadiths - beforeStats.hadiths).toLocaleString()}`);
console.log('');
console.log('Translations:');
console.log(`  Before: ${beforeStats.translations.toLocaleString()}`);
console.log(`  After:  ${afterStats.translations.toLocaleString()}`);
console.log(`  Change: +${(afterStats.translations - beforeStats.translations).toLocaleString()}`);
console.log('');

// Verify source distribution
const sourceDist = db.prepare(`
  SELECT source, COUNT(*) as count 
  FROM hadiths 
  GROUP BY source 
  ORDER BY count DESC
`).all();

console.log('Source distribution:');
sourceDist.forEach(row => {
  console.log(`  - ${row.source}: ${row.count.toLocaleString()}`);
});

db.close();
console.log('\n[Merge] Complete!');

// Helper function to map book names to collections
function mapBookToCollection(bookNameEn) {
  if (!bookNameEn) return null;
  const lower = bookNameEn.toLowerCase().trim();

  // 1. Check for specific multi-word matches first
  if (lower.includes('ibn majah')) return 'ibnmajah';
  if (lower.includes('abu dawud') || lower.includes('abu dawud')) return 'abudawud';
  if (lower.includes('an-nasai') || lower.includes('nasai')) return 'nasai';
  if (lower.includes('riyad as-salihin') || lower.includes('riyadussalihin')) return 'riyadussalihin';
  
  // 2. Handle the "Muslim" distinction
  if (lower.includes('hisn al-muslim') || lower.includes('hisn')) return 'hisn';
  if (lower.includes('sahih muslim') || lower.includes('muslim')) return 'muslim';

  // 3. Single word matches
  if (lower.includes('bukhari')) return 'bukhari';
  if (lower.includes('tirmidhi')) return 'tirmidhi';
  if (lower.includes('ahmad') || lower.includes('musnad')) return 'ahmad';
  if (lower.includes('mishkat')) return 'mishkat';
  if (lower.includes('adab al-mufrad') || lower.includes('adab')) return 'adab';
  if (lower.includes('shamail')) return 'shamail';
  if (lower.includes('bulugh al-maram')) return 'bulugh';
  if (lower.includes('forty nawawi') || lower.includes('nawawi')) return 'forty';

  return null;
}

// Parse a SQL row string into fields
function parseSQLRow(rowStr) {
  const fields = [];
  let current = '';
  let inString = false;
  
  for (let i = 0; i < rowStr.length; i++) {
    const char = rowStr[i];
    
    if (char === "'" && (i === 0 || rowStr[i-1] !== '\\')) {
      inString = !inString;
      current += char;
    } else if (char === ',' && !inString) {
      fields.push(current.replace(/^'|'$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.replace(/^'|'$/g, ''));
  
  return fields;
}
