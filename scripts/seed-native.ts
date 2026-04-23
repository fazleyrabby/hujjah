#!/usr/bin/env ts-node
/**
 * TASK 1: Native Seeder
 * Pre-bakes a SQLite database with Quran + selective Hadith data.
 * Uses better-sqlite3 (synchronous, fast for bulk inserts).
 * 
 * Run: npx ts-node scripts/seed-native.ts
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const DATA_DIR = '/Users/rabbi/Desktop/hujjah resources';
const OUTPUT_DIR = path.join(process.cwd(), 'src-tauri', 'resources');
const DB_PATH = path.join(OUTPUT_DIR, 'hujjah.db');

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Remove old DB if exists
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
}

const db = new Database(DB_PATH);

// ─── Schema ───
db.exec(`
  -- Main content table
  CREATE TABLE content_store (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    ref TEXT NOT NULL,
    type TEXT NOT NULL
  );

  -- FTS5 for full-text search
  CREATE VIRTUAL TABLE fts_idx USING fts5(
    text,
    content='content_store',
    content_rowid='id'
  );

  -- Triggers to keep FTS index in sync
  CREATE TRIGGER content_store_ai AFTER INSERT ON content_store BEGIN
    INSERT INTO fts_idx(rowid, text) VALUES (new.id, new.text);
  END;
  CREATE TRIGGER content_store_ad AFTER DELETE ON content_store BEGIN
    INSERT INTO fts_idx(fts_idx, rowid, text) VALUES ('delete', old.id, old.text);
  END;
  CREATE TRIGGER content_store_au AFTER UPDATE ON content_store BEGIN
    INSERT INTO fts_idx(fts_idx, rowid, text) VALUES ('delete', old.id, old.text);
    INSERT INTO fts_idx(rowid, text) VALUES (new.id, new.text);
  END;
`);

// ─── Insert Helpers ───
const insertStmt = db.prepare('INSERT INTO content_store (text, ref, type) VALUES (?, ?, ?)');

function insertBatch(items: { text: string; ref: string; type: string }[]) {
  const insert = db.transaction((rows: typeof items) => {
    for (const row of rows) {
      insertStmt.run(row.text, row.ref, row.type);
    }
  });
  insert(items);
}

// ─── 1. Seed Quran ───
console.log('\n📖 Seeding Quran...');
function seedQuran() {
  const sqlPath = path.join(DATA_DIR, 'quran-uthmani.sql');
  if (!fs.existsSync(sqlPath)) {
    console.log('  ⚠️ quran-uthmani.sql not found');
    return;
  }

  const content = fs.readFileSync(sqlPath, 'utf-8');
  const lines = content.split('\n');
  const items: { text: string; ref: string; type: string }[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*\(\d+,\s*(\d+),\s*(\d+),\s*'((?:[^']|'')*)'\),?\s*$/);
    if (match) {
      const surah = parseInt(match[1]);
      const ayah = parseInt(match[2]);
      const text = match[3].replace(/''/g, "'");
      items.push({ text, ref: `Quran ${surah}:${ayah}`, type: 'quran' });
    }
  }

  insertBatch(items);
  console.log(`  ✅ ${items.length} ayahs inserted`);
}

// ─── 2. Seed Hadith (Top 10 books only) ───
console.log('\n📜 Seeding Hadith (top 10 books)...');
async function seedHadith() {
  const csvPath = path.join(DATA_DIR, 'Sanadset 650K Data on Hadith Narrators', 'sanadset.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('  ⚠️ sanadset.csv not found');
    return;
  }

  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  // Track book counts to limit to top 10
  const bookCounts = new Map<string, number>();
  const topBooks = new Set<string>();
  const MAX_PER_BOOK = 5000;
  let totalInserted = 0;
  let lineNum = 0;
  let header: string[] | null = null;
  const batch: { text: string; ref: string; type: string }[] = [];

  for await (const line of rl) {
    lineNum++;

    if (lineNum === 1) {
      header = line.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      continue;
    }

    // Parse CSV with quoted fields
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());

    const bookName = fields[0]?.replace(/^"|"$/g, '') || '';
    const hadithNum = fields[1] || '';
    const hadithText = fields[2]?.replace(/^"|"$/g, '') || '';

    if (!bookName || !hadithText) continue;

    // Track book counts
    const count = (bookCounts.get(bookName) || 0) + 1;
    bookCounts.set(bookName, count);

    // Only keep top 10 books by volume
    if (topBooks.size < 10 || topBooks.has(bookName)) {
      if (count <= MAX_PER_BOOK) {
        topBooks.add(bookName);
        batch.push({
          text: hadithText,
          ref: `${bookName} #${hadithNum}`,
          type: 'hadith'
        });

        if (batch.length >= 500) {
          insertBatch(batch.splice(0, batch.length));
          totalInserted += 500;
          if (totalInserted % 5000 === 0) {
            process.stdout.write(`\r  Inserted ${totalInserted.toLocaleString()} hadiths...`);
          }
        }
      }
    }
  }

  if (batch.length > 0) {
    insertBatch(batch);
    totalInserted += batch.length;
  }

  console.log(`\n  ✅ ${totalInserted.toLocaleString()} hadiths inserted`);
  console.log(`  📚 Top books: ${Array.from(topBooks).join(', ')}`);
}

// ─── 3. Seed Books Metadata ───
console.log('\n📚 Seeding Books metadata...');
function seedBooks() {
  const csvPath = path.join(DATA_DIR, 'Sanadset 650K Data on Hadith Narrators', 'books.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('  ⚠️ books.csv not found');
    return;
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const items: { text: string; ref: string; type: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const bookName = lines[i].trim();
    if (!bookName || bookName === 'Book') continue;
    items.push({ text: bookName, ref: `Book ${i}`, type: 'books' });
  }

  insertBatch(items);
  console.log(`  ✅ ${items.length} books inserted`);
}

// ─── Main ───
async function main() {
  console.log('🔥 Hujjah Native Seeder');
  console.log('========================');
  console.log(`Output: ${DB_PATH}`);

  seedQuran();
  await seedHadith();
  seedBooks();

  // Optimize
  db.exec('VACUUM;');

  // Stats
  const quranCount = db.prepare("SELECT count(*) as c FROM content_store WHERE type = 'quran'").get() as { c: number };
  const hadithCount = db.prepare("SELECT count(*) as c FROM content_store WHERE type = 'hadith'").get() as { c: number };
  const booksCount = db.prepare("SELECT count(*) as c FROM content_store WHERE type = 'books'").get() as { c: number };
  const totalCount = db.prepare("SELECT count(*) as c FROM content_store").get() as { c: number };

  console.log('\n📊 Summary');
  console.log('==========');
  console.log(`Quran:   ${quranCount.c.toLocaleString()}`);
  console.log(`Hadith:  ${hadithCount.c.toLocaleString()}`);
  console.log(`Books:   ${booksCount.c.toLocaleString()}`);
  console.log(`Total:   ${totalCount.c.toLocaleString()}`);

  const stats = fs.statSync(DB_PATH);
  console.log(`\n💾 DB Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`📍 Location: ${DB_PATH}`);

  db.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
