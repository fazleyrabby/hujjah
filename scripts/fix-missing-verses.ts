#!/usr/bin/env ts-node
/**
 * Fix missing verses in hujjah-quran.db
 *
 * The original build script failed to parse lines ending with ');'
 * causing the last verse of each surah to be missing (114 verses total).
 *
 * 1. Extract missing verses from quran-uthmani.sql
 * 2. Insert them into verses table with correct IDs
 * 3. Extract corresponding translations from Tanzil SQL files
 * 4. Insert missing translations
 * 5. Rebuild FTS5 index
 *
 * Run: npx ts-node scripts/fix-missing-verses.ts
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'src-tauri', 'resources', 'hujjah-quran.db');
const QURAN_SQL = '/Users/rabbi/Desktop/hujjah resources/quran-uthmani.sql';
const TRANSLATIONS_DIR = '/Users/rabbi/Desktop/hujjah resources/translations';

const db = new Database(DB_PATH);

// ─── 1. Find existing verses to know which are missing ───
console.log('🔍 Finding missing verses...');
const existing = new Set<number>();
const rows = db.prepare('SELECT id, surah, ayah FROM verses').all() as { id: number; surah: number; ayah: number }[];
for (const r of rows) {
  existing.add(r.id);
}

// Build a map of expected (sura, aya) -> id from source
const verseMap = new Map<number, { surah: number; ayah: number; text: string }>();

const content = fs.readFileSync(QURAN_SQL, 'utf-8');
const lines = content.split(/\r?\n/);
const tupleRegex = /^\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)\s*[,;]\s*$/;

for (const line of lines) {
  const match = line.trim().match(tupleRegex);
  if (!match) continue;
  const id = parseInt(match[1]);
  const surah = parseInt(match[2]);
  const ayah = parseInt(match[3]);
  const text = match[4].replace(/\\'/g, "'");
  verseMap.set(id, { surah, ayah, text });
}

const missing: { id: number; surah: number; ayah: number; text: string }[] = [];
for (const [id, data] of verseMap) {
  if (!existing.has(id)) {
    missing.push({ id, ...data });
  }
}

missing.sort((a, b) => a.id - b.id);
console.log(`  ✅ ${missing.length} missing verses found`);
for (const v of missing.slice(0, 5)) {
  console.log(`    Missing: ${v.surah}:${v.ayah} (id=${v.id})`);
}
if (missing.length > 5) {
  console.log(`    ... and ${missing.length - 5} more`);
}

// ─── 2. Insert missing verses ───
console.log('\n📥 Inserting missing verses...');
const insertVerse = db.prepare('INSERT INTO verses (id, surah, ayah, text_ar) VALUES (?, ?, ?, ?)');
const insertBatch = db.transaction((verses: typeof missing) => {
  for (const v of verses) {
    insertVerse.run(v.id, v.surah, v.ayah, v.text);
  }
});
insertBatch(missing);
console.log(`  ✅ ${missing.length} verses inserted`);

// ─── 3. Insert missing translations ───
console.log('\n📥 Inserting missing translations...');

const files = fs.readdirSync(TRANSLATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .filter((f) => {
    const lang = f.split('.')[0];
    return lang === 'en' || lang === 'bn';
  })
  .sort();

const insertTrans = db.prepare(
  'INSERT INTO translations (verse_id, lang_code, translator_slug, text) VALUES (?, ?, ?, ?)'
);

// Build lookup: surah:ayah -> verse_id for missing verses
const missingLookup = new Map<string, number>();
for (const v of missing) {
  missingLookup.set(`${v.surah}:${v.ayah}`, v.id);
}

for (const file of files) {
  const base = file.replace('.sql', '');
  const parts = base.split('.');
  const langCode = parts[0];
  const translatorSlug = parts.slice(1).join('.');

  const filePath = path.join(TRANSLATIONS_DIR, file);
  const tContent = fs.readFileSync(filePath, 'utf-8');
  const tLines = tContent.split(/\r?\n/);

  const transRows: { verse_id: number; lang_code: string; translator_slug: string; text: string }[] = [];

  for (const line of tLines) {
    const match = line.trim().match(tupleRegex);
    if (!match) continue;

    const sura = parseInt(match[2]);
    const aya = parseInt(match[3]);
    const verseId = missingLookup.get(`${sura}:${aya}`);
    if (!verseId) continue; // Skip non-missing verses

    let cleanText = match[4]
      .replace(/\\'/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#039;/g, "'");

    transRows.push({ verse_id: verseId, lang_code: langCode, translator_slug: translatorSlug, text: cleanText });
  }

  if (transRows.length > 0) {
    const insertTransBatch = db.transaction((batch: typeof transRows) => {
      for (const row of batch) {
        insertTrans.run(row.verse_id, row.lang_code, row.translator_slug, row.text);
      }
    });
    insertTransBatch(transRows);
    console.log(`  ✅ ${file}: ${transRows.length} missing translations inserted`);
  }
}

// ─── 4. Rebuild FTS5 ───
console.log('\n🔍 Rebuilding FTS5 index...');
db.exec("INSERT INTO quran_search_idx(quran_search_idx) VALUES('rebuild');");

const ftsCount = db.prepare("SELECT COUNT(*) as c FROM quran_search_idx").get() as { c: number };
console.log(`  ✅ quran_search_idx: ${ftsCount.c.toLocaleString()} rows`);

// ─── 5. Verify ───
console.log('\n📊 Verification:');
const totalVerses = db.prepare("SELECT COUNT(*) as c FROM verses").get() as { c: number };
const totalTrans = db.prepare("SELECT COUNT(*) as c FROM translations").get() as { c: number };
console.log(`  Verses:       ${totalVerses.c.toLocaleString()} (expected: 6236)`);
console.log(`  Translations: ${totalTrans.c.toLocaleString()}`);

const check1 = db.prepare("SELECT text_ar FROM verses WHERE surah = 1 AND ayah = 7").get() as { text_ar: string } | undefined;
console.log(`  Sura 1:7 (AR): ${check1?.text_ar?.slice(0, 60) ?? 'NOT FOUND'}...`);

const check2 = db.prepare(`
  SELECT t.text FROM translations t
  JOIN verses v ON v.id = t.verse_id
  WHERE v.surah = 2 AND v.ayah = 255 AND t.lang_code = 'bn'
  LIMIT 1
`).get() as { text: string } | undefined;
console.log(`  Sura 2:255 (BN): ${check2?.text?.slice(0, 80) ?? 'NOT FOUND'}...`);

const check3 = db.prepare(`
  SELECT t.text FROM translations t
  JOIN verses v ON v.id = t.verse_id
  WHERE v.surah = 2 AND v.ayah = 286 AND t.lang_code = 'en'
  LIMIT 1
`).get() as { text: string } | undefined;
console.log(`  Sura 2:286 (EN): ${check3?.text?.slice(0, 80) ?? 'NOT FOUND'}...`);

// ─── Optimize ───
db.exec('VACUUM;');
db.exec('ANALYZE;');

console.log('\n🎉 Missing verses fix complete!');
db.close();
