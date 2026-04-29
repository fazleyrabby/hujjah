#!/usr/bin/env node
/**
 * scripts/migrate-sunnah-schema.cjs
 * 
 * Phase 1: Add schema columns for Sunnah.com data integration
 * Run this BEFORE the merge script
 * 
 * Usage: node apps/web/scripts/migrate-sunnah-schema.cjs
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(process.cwd(), 'apps/web/data/hujjah-hadith-core.db');

console.log('[Migration] Opening database:', DB_PATH);

if (!fs.existsSync(DB_PATH)) {
  console.error('[Migration] ERROR: Database file not found at', DB_PATH);
  console.error('[Migration] Make sure DB files are symlinked in apps/web/data/');
  process.exit(1);
}

// Open with read-write mode for schema changes
const db = new Database(DB_PATH, { readonly: false });
db.pragma('journal_mode = WAL');

console.log('[Migration] Starting schema migrations...\n');

const migrations = [
  // Source tracking columns
  { name: 'source', sql: 'ALTER TABLE hadiths ADD COLUMN source TEXT DEFAULT \'sanadset\'' },
  { name: 'sunnah_arabic_urn', sql: 'ALTER TABLE hadiths ADD COLUMN sunnah_arabic_urn INTEGER' },
  { name: 'sunnah_english_urn', sql: 'ALTER TABLE hadiths ADD COLUMN sunnah_english_urn INTEGER' },
  { name: 'sunnah_collection', sql: 'ALTER TABLE hadiths ADD COLUMN sunnah_collection TEXT' },
  { name: 'sunnah_book_number', sql: 'ALTER TABLE hadiths ADD COLUMN sunnah_book_number TEXT' },
  { name: 'sunnah_hadith_number', sql: 'ALTER TABLE hadiths ADD COLUMN sunnah_hadith_number TEXT' },
  { name: 'grade_ar', sql: 'ALTER TABLE hadiths ADD COLUMN grade_ar TEXT' },
  { name: 'grade_en', sql: 'ALTER TABLE hadiths ADD COLUMN grade_en TEXT' },
  
  // Indexes for sunnah.com lookups
  { name: 'idx_hadiths_sunnah_urn', sql: 'CREATE INDEX IF NOT EXISTS idx_hadiths_sunnah_urn ON hadiths(sunnah_arabic_urn)' },
  { name: 'idx_hadiths_sunnah_collection', sql: 'CREATE INDEX IF NOT EXISTS idx_hadiths_sunnah_collection ON hadiths(sunnah_collection, sunnah_book_number, sunnah_hadith_number)' },
  
  // Narrator columns for Phase 2
  { name: 'narrators_data_source', sql: 'ALTER TABLE narrators ADD COLUMN data_source TEXT DEFAULT \'sanadset\'' },
  { name: 'narrators_name_normalized', sql: 'ALTER TABLE narrators ADD COLUMN name_normalized TEXT' },
  { name: 'narrators_sunnah_id', sql: 'ALTER TABLE narrators ADD COLUMN sunnah_narrator_id INTEGER' },
  { name: 'idx_narrators_normalized', sql: 'CREATE INDEX IF NOT EXISTS idx_narrators_normalized ON narrators(name_normalized)' },
];

let success = 0;
let skipped = 0;
let errors = 0;

for (const migration of migrations) {
  try {
    db.exec(migration.sql);
    console.log(`✓ ${migration.name}`);
    success++;
  } catch (err) {
    if (err.message.includes('duplicate column') || err.message.includes('already exists')) {
      console.log(`⊘ ${migration.name} (already exists)`);
      skipped++;
    } else {
      console.error(`✗ ${migration.name}: ${err.message}`);
      errors++;
    }
  }
}

// Create sunnah_collections table
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sunnah_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection TEXT NOT NULL UNIQUE,
      name_ar TEXT,
      name_en TEXT,
      book_count INTEGER DEFAULT 0
    )
  `);
  
  const collections = [
    ['bukhari', 'صحيح البخاري', 'Sahih al-Bukhari'],
    ['muslim', 'صحيح مسلم', 'Sahih Muslim'],
    ['abudawud', 'سنن أبي داود', 'Sunan Abi Dawud'],
    ['tirmidhi', 'جامع الترمذي', 'Jami` at-Tirmidhi'],
    ['nasai', 'سنن النسائي', 'Sunan an-Nasa\'i'],
    ['ibnmajah', 'سنن ابن ماجه', 'Sunan Ibn Majah'],
    ['ahmad', 'مسند أحمد', 'Musnad Ahmad'],
    ['mishkat', 'مشكاة المصابيح', 'Mishkat al-Masabih'],
    ['riyadussalihin', 'رياض الصالحين', 'Riyad as-Salihin'],
    ['adab', 'الأدب المفرد', 'Al-Adab Al-Mufrad'],
    ['shamail', 'الشمائل المحمدية', 'Shama\'il Muhammadiyah'],
    ['bulugh', 'بلوغ المرام', 'Bulugh al-Maram'],
    ['hisn', 'حصن المسلم', 'Hisn al-Muslim'],
    ['forty', 'الأربعون النووية', '40 Hadith Nawawi'],
  ];
  
  const insert = db.prepare('INSERT OR IGNORE INTO sunnah_collections (collection, name_ar, name_en) VALUES (?, ?, ?)');
  for (const [col, ar, en] of collections) {
    insert.run(col, ar, en);
  }
  
  console.log('✓ sunnah_collections table created with 14 collections');
  success++;
} catch (err) {
  console.error(`✗ sunnah_collections: ${err.message}`);
  errors++;
}

console.log(`\n[Migration] Complete: ${success} succeeded, ${skipped} skipped, ${errors} errors`);

db.close();
process.exit(errors > 0 ? 1 : 0);
