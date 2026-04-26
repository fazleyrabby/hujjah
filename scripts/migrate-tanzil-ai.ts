#!/usr/bin/env ts-node
/**
 * Tanzil.net Translation Ingestion (Clean Swap)
 *
 * 1. Deletes ALL existing translations
 * 2. Ingests only en + bn Tanzil SQL files
 * 3. Rebuilds FTS5 index
 * 4. Generates embeddings for English translations
 *
 * Run: npx ts-node scripts/migrate-tanzil-ai.ts
 */

import Database from 'better-sqlite3';
import { env, pipeline } from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const DB_PATH = path.join(process.cwd(), 'src-tauri', 'resources', 'hujjah-quran.db');
const TRANSLATIONS_DIR = '/Users/rabbi/Desktop/hujjah resources/translations';

if (!fs.existsSync(DB_PATH)) {
  console.error('Database not found:', DB_PATH);
  process.exit(1);
}

// Configure local model path for embeddings
env.localModelPath = path.join(process.cwd(), 'src-tauri', 'resources', 'models');
env.allowRemoteModels = false;

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

// ─── 3. Parse & Ingest SQL files ───
interface TranslationRow {
  verse_id: number;
  lang_code: string;
  translator_slug: string;
  text: string;
}

const tupleRegex = /^\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)\s*[,;]\s*$/;

function parseSqlFile(filePath: string, langCode: string, translatorSlug: string): TranslationRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const rows: TranslationRow[] = [];

  for (const rawLine of lines) {
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

console.log('\n📥 Ingesting Tanzil translations...');

const files = fs.readdirSync(TRANSLATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .filter((f) => {
    const lang = f.split('.')[0];
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

  if (rows.length !== 6236) {
    console.warn(`    ⚠️ Expected 6236 verses, got ${rows.length}`);
  }

  const insertBatch = db.transaction((batch: TranslationRow[]) => {
    for (const row of batch) {
      insertStmt.run(row.verse_id, row.lang_code, row.translator_slug, row.text);
    }
  });

  insertBatch(rows);
  console.log(`    ✅ ${rows.length} rows inserted`);
}

// ─── 4. Recreate FTS5 ───
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

// ─── 5. Generate Embeddings for English ───
console.log('\n🧠 Generating embeddings for English translations...');
const enRows = db.prepare("SELECT id, text FROM translations WHERE lang_code = 'en'").all() as { id: number; text: string }[];
console.log(`  ${enRows.length} English rows to embed`);

if (enRows.length > 0) {
  console.log('  📦 Loading model...');
  const extractor = await pipeline('feature-extraction', 'bge-m3', { quantized: true });
  console.log('  ✅ Model loaded');

  const updateStmt = db.prepare('UPDATE translations SET embedding = ? WHERE id = ?');
  const BATCH_SIZE = 100;
  let processed = 0;

  for (let i = 0; i < enRows.length; i += BATCH_SIZE) {
    const batch = enRows.slice(i, i + BATCH_SIZE);
    const texts = batch.map((r) => r.text);
    const outputs = await extractor(texts, { pooling: 'mean', normalize: true });
    const embeddings: number[][] = outputs.tolist();

    const updateBatch = db.transaction((items: { id: number; emb: Buffer }[]) => {
      for (const item of items) {
        updateStmt.run(item.emb, item.id);
      }
    });

    const items = batch.map((r, idx) => {
      const vec = embeddings[idx];
      const buffer = Buffer.from(new Float32Array(vec).buffer);
      return { id: r.id, emb: buffer };
    });

    updateBatch(items);
    processed += batch.length;

    const pct = Math.round((processed / enRows.length) * 100);
    const filled = Math.round(pct / 2);
    const empty = 50 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    process.stdout.write(`\r  [${bar}] ${pct}% (${processed.toLocaleString()}/${enRows.length.toLocaleString()})`);
  }
  console.log('');
  console.log('  ✅ Embeddings generated');
}

// ─── 6. Verify ───
console.log('\n📊 Verification:');
const enCount = db.prepare("SELECT COUNT(*) as c FROM translations WHERE lang_code = 'en'").get() as { c: number };
const bnCount = db.prepare("SELECT COUNT(*) as c FROM translations WHERE lang_code = 'bn'").get() as { c: number };
const totalCount = db.prepare("SELECT COUNT(*) as c FROM translations").get() as { c: number };
const embCount = db.prepare("SELECT COUNT(*) as c FROM translations WHERE lang_code = 'en' AND embedding IS NOT NULL").get() as { c: number };
console.log(`  English:     ${enCount.c.toLocaleString()}`);
console.log(`  Bengali:     ${bnCount.c.toLocaleString()}`);
console.log(`  Total:       ${totalCount.c.toLocaleString()}`);
console.log(`  Embeddings:  ${embCount.c.toLocaleString()}`);

// ─── 7. Sample checks ───
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
console.log(`  Sura 2:255 (BN): ${check2?.text ? check2.text.slice(0, 120) + '...' : 'NOT FOUND'}`);

const check3 = db.prepare(`
  SELECT t.text FROM translations t
  JOIN verses v ON v.id = t.verse_id
  WHERE v.surah = 2 AND v.ayah = 255 AND t.lang_code = 'en'
  LIMIT 1
`).get() as { text: string } | undefined;
console.log(`  Sura 2:255 (EN): ${check3?.text ? check3.text.slice(0, 120) + '...' : 'NOT FOUND'}`);

// ─── Optimize ───
db.exec('VACUUM;');
db.exec('ANALYZE;');

console.log('\n🎉 Tanzil AI migration complete!');
console.log(`📍 Database: ${DB_PATH}`);

db.close();
