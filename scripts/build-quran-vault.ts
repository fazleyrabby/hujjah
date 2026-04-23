#!/usr/bin/env ts-node
/**
 * TASK 2: High-Performance Quran Vault Seeder
 * 
 * Creates a unified SQLite database from:
 * - quran-uthmani.sql (Arabic text)
 * - global quran data/*.json (111 translations)
 * 
 * Output: src-tauri/resources/hujjah-quran.db
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const DATA_DIR = '/Users/rabbi/Desktop/hujjah resources';
const OUTPUT_DIR = path.join(process.cwd(), 'src-tauri', 'resources');
const DB_PATH = path.join(OUTPUT_DIR, 'hujjah-quran.db');
const BATCH_SIZE = 1000;

// ─── Ensure output dir ───
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Remove old DB if exists
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
}

const db = new Database(DB_PATH);

// ─── TASK 1: Schema ───
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;

  -- Arabic verses (Uthmani script)
  CREATE TABLE verses (
    id INTEGER PRIMARY KEY,
    surah INTEGER NOT NULL,
    ayah INTEGER NOT NULL,
    text_ar TEXT NOT NULL
  );

  -- Translations / Tafsir
  CREATE TABLE translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    verse_id INTEGER NOT NULL,
    lang_code TEXT NOT NULL,
    translator_slug TEXT NOT NULL,
    text TEXT NOT NULL,
    FOREIGN KEY (verse_id) REFERENCES verses(id)
  );

  -- FTS5 search index on translation text
  CREATE VIRTUAL TABLE search_idx USING fts5(
    text,
    verse_id UNINDEXED,
    lang_code UNINDEXED,
    tokenize = 'unicode61',
    content='translations',
    content_rowid='id'
  );

  -- Triggers to keep FTS index in sync
  CREATE TRIGGER translations_ai AFTER INSERT ON translations BEGIN
    INSERT INTO search_idx(rowid, text, verse_id, lang_code)
    VALUES (new.id, new.text, new.verse_id, new.lang_code);
  END;

  CREATE TRIGGER translations_ad AFTER DELETE ON translations BEGIN
    INSERT INTO search_idx(search_idx, rowid, text, verse_id, lang_code)
    VALUES ('delete', old.id, old.text, old.verse_id, old.lang_code);
  END;

  CREATE TRIGGER translations_au AFTER UPDATE ON translations BEGIN
    INSERT INTO search_idx(search_idx, rowid, text, verse_id, lang_code)
    VALUES ('delete', old.id, old.text, old.verse_id, old.lang_code);
    INSERT INTO search_idx(rowid, text, verse_id, lang_code)
    VALUES (new.id, new.text, new.verse_id, new.lang_code);
  END;

  -- Indexes for instant JOINs
  CREATE INDEX idx_verses_surah_ayah ON verses(surah, ayah);
  CREATE INDEX idx_translations_verse ON translations(verse_id);
  CREATE INDEX idx_translations_lang ON translations(lang_code, translator_slug);
`);

// ─── Prepared statements ───
const insertVerse = db.prepare('INSERT INTO verses (id, surah, ayah, text_ar) VALUES (?, ?, ?, ?)');
const insertTranslation = db.prepare('INSERT INTO translations (verse_id, lang_code, translator_slug, text) VALUES (?, ?, ?, ?)');

// ─── 1. Seed Arabic verses (streaming SQL) ───
console.log('📖 Seeding Arabic verses...');
async function seedArabic() {
  const sqlPath = path.join(DATA_DIR, 'quran-uthmani.sql');
  if (!fs.existsSync(sqlPath)) {
    throw new Error('quran-uthmani.sql not found');
  }

  const fileStream = fs.createReadStream(sqlPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let count = 0;
  let batch: { id: number; surah: number; ayah: number; text: string }[] = [];

  const insertBatch = db.transaction((rows: typeof batch) => {
    for (const row of rows) {
      insertVerse.run(row.id, row.surah, row.ayah, row.text);
    }
  });

  for await (const line of rl) {
    const match = line.match(/^\s*\((\d+),\s*(\d+),\s*(\d+),\s*'((?:[^']|'')*)'\),?\s*$/);
    if (match) {
      const id = parseInt(match[1]);
      const surah = parseInt(match[2]);
      const ayah = parseInt(match[3]);
      const text = match[4].replace(/''/g, "'");

      batch.push({ id, surah, ayah, text });

      if (batch.length >= BATCH_SIZE) {
        insertBatch(batch);
        count += batch.length;
        process.stdout.write(`\r  Inserted ${count.toLocaleString()} ayahs...`);
        batch = [];
      }
    }
  }

  if (batch.length > 0) {
    insertBatch(batch);
    count += batch.length;
  }

  console.log(`\r  ✅ ${count.toLocaleString()} Arabic verses inserted`);
}

// ─── 2. Seed translations (batch JSON) ───
console.log('\n🌍 Seeding translations...');
function seedTranslations() {
  const commentaryDir = path.join(DATA_DIR, 'global quran data');
  if (!fs.existsSync(commentaryDir)) {
    console.log('  ⚠️ global quran data not found');
    return;
  }

  // Build a lookup: surah + ayah -> verse_id for foreign key resolution
  const verseLookup = new Map<string, number>();
  const allVerses = db.prepare('SELECT id, surah, ayah FROM verses').all() as { id: number; surah: number; ayah: number }[];
  for (const v of allVerses) {
    verseLookup.set(`${v.surah}:${v.ayah}`, v.id);
  }
  console.log(`  Built lookup: ${verseLookup.size} verses`);

  const files = fs.readdirSync(commentaryDir).filter(f => f.endsWith('.json'));
  let totalTranslations = 0;
  let skipped = 0;

  const insertBatch = db.transaction((rows: { verseId: number; lang: string; slug: string; text: string }[]) => {
    for (const row of rows) {
      insertTranslation.run(row.verseId, row.lang, row.slug, row.text);
    }
  });

  for (const file of files) {
    // Skip Quran text variants (not translations)
    if (file.startsWith('quran-') && !file.includes('translation')) {
      continue;
    }

    // Map filename: "en.asad.json" -> lang="en", slug="asad"
    const base = file.replace('.json', '');
    const parts = base.split('.');
    if (parts.length < 2) continue;

    const langCode = parts[0];
    const translatorSlug = parts.slice(1).join('.');

    const filePath = path.join(commentaryDir, file);
    const raw = fs.readFileSync(filePath, 'utf-8');
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      console.log(`  ⚠️ Failed to parse ${file}`);
      continue;
    }

    // Flatten nested structure: {"quran": {"en.asad": {"1": {...}}}}
    let verses: Record<string, any> = {};
    if (data.quran) {
      const innerKey = Object.keys(data.quran)[0];
      verses = data.quran[innerKey];
    } else {
      verses = data;
    }

    let batch: { verseId: number; lang: string; slug: string; text: string }[] = [];

    for (const key in verses) {
      const entry = verses[key];
      if (!entry || (!entry.verse && !entry.text)) continue;

      const surah = entry.surah || 0;
      const ayah = entry.ayah || 0;
      const verseId = verseLookup.get(`${surah}:${ayah}`);

      if (!verseId) {
        skipped++;
        continue; // Skip if no matching Arabic verse
      }

      const text = entry.verse || entry.text || '';

      batch.push({ verseId, lang: langCode, slug: translatorSlug, text });

      if (batch.length >= BATCH_SIZE) {
        insertBatch(batch);
        totalTranslations += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      insertBatch(batch);
      totalTranslations += batch.length;
    }

    console.log(`  ✅ ${file}: ${Object.keys(verses).length} verses (${langCode}.${translatorSlug})`);
  }

  console.log(`  ✅ Total translations: ${totalTranslations.toLocaleString()}`);
  if (skipped > 0) {
    console.log(`  ⚠️  Skipped: ${skipped.toLocaleString()} (no matching Arabic verse)`);
  }
}

// ─── 3. Optimize ───
function optimize() {
  console.log('\n🗜️  Optimizing...');
  db.exec('VACUUM;');
  db.exec('ANALYZE;');
  console.log('  ✅ Done');
}

// ─── Main ───
async function main() {
  console.log('🔥 Building Unified Quran Vault');
  console.log('================================');
  console.log(`Output: ${DB_PATH}`);

  await seedArabic();
  seedTranslations();
  optimize();

  // Stats
  const arabic = db.prepare('SELECT count(*) as c FROM verses').get() as { c: number };
  const translations = db.prepare('SELECT count(*) as c FROM translations').get() as { c: number };
  const langs = db.prepare('SELECT count(DISTINCT lang_code) as c FROM translations').get() as { c: number };
  const translators = db.prepare('SELECT count(DISTINCT translator_slug) as c FROM translations').get() as { c: number };

  console.log('\n📊 Summary');
  console.log('==========');
  console.log(`Arabic verses:   ${arabic.c.toLocaleString()}`);
  console.log(`Translations:    ${translations.c.toLocaleString()}`);
  console.log(`Languages:       ${langs.c}`);
  console.log(`Translators:     ${translators.c}`);

  const stats = fs.statSync(DB_PATH);
  console.log(`\n💾 DB Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`📍 Location: ${DB_PATH}`);

  db.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
