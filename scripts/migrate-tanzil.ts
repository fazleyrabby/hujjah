#!/usr/bin/env ts-node
/**
 * Tanzil.net Translation Ingestion
 *
 * 1. Deletes ALL existing translations
 * 2. Ingests only en + bn Tanzil SQL files
 * 3. Rebuilds FTS5 index
 * 4. Keeps only en/bn in the database
 *
 * Run: npx ts-node scripts/migrate-tanzil.ts
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const DB_PATH = path.join(process.cwd(), 'src-tauri', 'resources', 'hujjah-quran.db');
const TRANSLATIONS_DIR = '/Users/rabbi/Desktop/hujjah resources/translations';

if (!fs.existsSync(DB_PATH)) {
  console.error('Database not found:', DB_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH);

// ─── 1. Clean slate ───
console.log('🧹 Cleaning database...');
db.exec(`
  DROP TABLE IF EXISTS quran_search_idx;
  DROP TRIGGER IF EXISTS translations_ai;
  DROP TRIGGER IF EXISTS translations_ad;
  DROP TRIGGER IF EXISTS translations_au;
  DELETE FROM translations;
`);
console.log('  ✅ All translations and FTS5 cleared');

// ─── 2. Build verse lookup ───
console.log('\n📖 Building verse lookup...');
const verseLookup = new Map<string, number>();
const verses = db.prepare('SELECT id, surah, ayah FROM verses').all() as { id: number; surah: number; ayah: number }[];
for (const v of verses) {
  verseLookup.set(`${v.surah}:${v.ayah}`, v.id);
}
console.log(`  ✅ ${verseLookup.size} verses mapped`);

// ─── 3. Parse SQL files ───
interface TranslationRow {
  verse_id: number;
  lang_code: string;
  translator_slug: string;
  text: string;
}

function parseSqlFile(filePath: string, langCode: string, translatorSlug: string): TranslationRow[] {
  const rows: TranslationRow[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const tupleRegex = /^\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)\s*[,;]\s*$/;

  for (const rawLine of rl) {
    const line = rawLine.trim();
    const match = line.match(tupleRegex);
    if (!match) continue;

    const sura = parseInt(match[2]);
    const aya = parseInt(match[3]);
    const verseId = verseLookup.get(`${sura}:${aya}`);

    if (!verseId) {
      console.warn(`    ⚠️ No verse found for ${sura}:${aya}`);
      continue;
    }

    // Sanitize text
    let cleanText = match[4]
      .replace(/\\'/g, "'")      // MySQL escaped quotes
      .replace(/&quot;/g, '"')    // HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#039;/g, "'");

    rows.push({
      verse_id: verseId,
      lang_code: langCode,
      translator_slug: translatorSlug,
      text: cleanText,
    });
  }

  return rows;
}

// ─── 4. Ingest files ───
console.log('\n📥 Ingesting Tanzil translations...');

const files = fs.readdirSync(TRANSLATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .filter((f) => {
    const base = f.replace('.sql', '');
    const lang = base.split('.')[0];
    return lang === 'en' || lang === 'bn';
  })
  .sort();

const insertStmt = db.prepare(
  'INSERT INTO translations (verse_id, lang_code, translator_slug, text) VALUES (?, ?, ?, ?)'
);

for (const file of files) {
  const base = file.replace('.sql', '');
  const parts = base.split('.');
  const langCode = parts[0];
  const translatorSlug = parts.slice(1).join('.');

  console.log(`\n  📄 ${file} (${langCode}.${translatorSlug})`);
  const filePath = path.join(TRANSLATIONS_DIR, file);
  const rows = parseSqlFile(filePath, langCode, translatorSlug);

  if (rows.length === 0) {
    console.log('    ⚠️ No rows parsed');
    continue;
  }

  const insertBatch = db.transaction((batch: TranslationRow[]) => {
    for (const row of batch) {
      insertStmt.run(row.verse_id, row.lang_code, row.translator_slug, row.text);
    }
  });

  insertBatch(rows);
  console.log(`    ✅ ${rows.length} rows inserted`);
}

// ─── 5. Recreate FTS5 ───
console.log('\n🔍 Recreating FTS5 index...');
db.exec(`
  CREATE VIRTUAL TABLE quran_search_idx USING fts5(
    text,
    verse_id UNINDEXED,
    lang_code UNINDEXED,
    tokenize = 'unicode61',
    content='translations',
    content_rowid='id'
  );

  INSERT INTO quran_search_idx(rowid, text, verse_id, lang_code)
  SELECT id, text, verse_id, lang_code FROM translations WHERE lang_code IN ('en', 'bn');

  CREATE TRIGGER translations_ai AFTER INSERT ON translations BEGIN
    INSERT INTO quran_search_idx(rowid, text, verse_id, lang_code)
    VALUES (new.id, new.text, new.verse_id, new.lang_code);
  END;

  CREATE TRIGGER translations_ad AFTER DELETE ON translations BEGIN
    INSERT INTO quran_search_idx(quran_search_idx, rowid, text, verse_id, lang_code)
    VALUES ('delete', old.id, old.text, old.verse_id, old.lang_code);
  END;

  CREATE TRIGGER translations_au AFTER UPDATE ON translations BEGIN
    INSERT INTO quran_search_idx(quran_search_idx, rowid, text, verse_id, lang_code)
    VALUES ('delete', old.id, old.text, old.verse_id, old.lang_code);
    INSERT INTO quran_search_idx(rowid, text, verse_id, lang_code)
    VALUES (new.id, new.text, new.verse_id, new.lang_code);
  END;
`);

const ftsCount = db.prepare("SELECT COUNT(*) as c FROM quran_search_idx").get() as { c: number };
console.log(`  ✅ quran_search_idx: ${ftsCount.c.toLocaleString()} rows`);

// ─── 6. Verify ───
console.log('\n📊 Verification:');
const enCount = db.prepare("SELECT COUNT(*) as c FROM translations WHERE lang_code = 'en'").get() as { c: number };
const bnCount = db.prepare("SELECT COUNT(*) as c FROM translations WHERE lang_code = 'bn'").get() as { c: number };
const totalCount = db.prepare("SELECT COUNT(*) as c FROM translations").get() as { c: number };
console.log(`  English: ${enCount.c.toLocaleString()}`);
console.log(`  Bengali: ${bnCount.c.toLocaleString()}`);
console.log(`  Total:   ${totalCount.c.toLocaleString()}`);

// ─── 7. Check specific verses ───
console.log('\n🔎 Sample checks:');
const check1 = db.prepare(`
  SELECT t.text FROM translations t
  JOIN verses v ON v.id = t.verse_id
  WHERE v.surah = 1 AND v.ayah = 1 AND t.lang_code = 'bn'
  LIMIT 1
`).get() as { text: string } | undefined;
console.log(`  Sura 1:1 (BN): ${check1?.text ?? 'NOT FOUND'}`);

const check2 = db.prepare(`
  SELECT t.text FROM translations t
  JOIN verses v ON v.id = t.verse_id
  WHERE v.surah = 2 AND v.ayah = 255 AND t.lang_code = 'bn'
  LIMIT 1
`).get() as { text: string } | undefined;
console.log(`  Sura 2:255 (BN): ${check2?.text ? check2.text.slice(0, 100) + '...' : 'NOT FOUND'}`);

// ─── Optimize ───
db.exec('VACUUM;');
db.exec('ANALYZE;');

console.log('\n🎉 Tanzil migration complete!');
console.log(`📍 Database: ${DB_PATH}`);

db.close();
