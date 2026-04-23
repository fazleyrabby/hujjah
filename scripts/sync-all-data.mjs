#!/usr/bin/env node
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const RESOURCES_DIR = '/Users/rabbi/Desktop/hujjah resources';
const BATCH_SIZE = 100;

// ─── Progress Helper ───
function printProgress(label, current, total) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
  process.stdout.write(`\r  ${label} [${bar}] ${pct}% (${current.toLocaleString()} / ${total.toLocaleString()})`);
}

// ─── Duplicate Check ───
async function exists(db, sourceRef, category) {
  const res = await db.query(
    'SELECT 1 FROM knowledge WHERE source_ref = $1 AND category = $2 LIMIT 1',
    [sourceRef, category]
  );
  return res.rows.length > 0;
}

// ─── Batch Insert ───
async function insertBatch(db, items) {
  let inserted = 0;
  let skipped = 0;
  for (const item of items) {
    if (await exists(db, item.source_ref, item.category)) {
      skipped++;
      continue;
    }
    await db.query(
      'INSERT INTO knowledge (content, source_ref, category, embedding) VALUES ($1, $2, $3, $4)',
      [item.content, item.source_ref, item.category, item.embedding]
    );
    inserted++;
  }
  return { inserted, skipped };
}

// ─── 1. Quran SQL Parser ───
async function importQuran(db) {
  console.log('\n📖 Importing Quran...');
  const filePath = path.join(RESOURCES_DIR, 'quran-uthmani.sql');
  if (!fs.existsSync(filePath)) {
    console.log('  ❌ quran-uthmani.sql not found');
    return { inserted: 0, skipped: 0 };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const items = [];

  for (const line of lines) {
    const match = line.match(/^\s*\((\d+),\s*(\d+),\s*(\d+),\s*'((?:[^']|'')*)'\),?\s*$/);
    if (match) {
      const surah = parseInt(match[2]);
      const ayah = parseInt(match[3]);
      const text = match[4].replace(/''/g, "'");
      items.push({
        content: text,
        source_ref: `Quran ${surah}:${ayah}`,
        category: 'quran',
        embedding: '[' + Array(384).fill(0).join(',') + ']'
      });
    }
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const { inserted, skipped } = await insertBatch(db, batch);
    totalInserted += inserted;
    totalSkipped += skipped;
    printProgress('Quran', i + batch.length, items.length);
  }
  console.log(`\n  ✅ Quran: ${totalInserted} inserted, ${totalSkipped} skipped`);
  return { inserted: totalInserted, skipped: totalSkipped };
}

// ─── 2. Books CSV Parser ───
async function importBooks(db) {
  console.log('\n📚 Importing Books...');
  const filePath = path.join(RESOURCES_DIR, 'Sanadset 650K Data on Hadith Narrators', 'books.csv');
  if (!fs.existsSync(filePath)) {
    console.log('  ❌ books.csv not found');
    return { inserted: 0, skipped: 0 };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const items = [];

  for (let i = 0; i < lines.length; i++) {
    const bookName = lines[i].trim();
    if (!bookName || bookName === 'Book') continue;
    items.push({
      content: bookName,
      source_ref: `Book ${i}`,
      category: 'books',
        embedding: '[' + Array(384).fill(0).join(',') + ']'
      });
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const { inserted, skipped } = await insertBatch(db, batch);
    totalInserted += inserted;
    totalSkipped += skipped;
    printProgress('Books', i + batch.length, items.length);
  }
  console.log(`\n  ✅ Books: ${totalInserted} inserted, ${totalSkipped} skipped`);
  return { inserted: totalInserted, skipped: totalSkipped };
}

// ─── 3. Commentary JSON Parser ───
async function importCommentary(db) {
  console.log('\n📝 Importing Commentary...');
  const commentaryDir = path.join(RESOURCES_DIR, 'global quran data');
  if (!fs.existsSync(commentaryDir)) {
    console.log('  ❌ global quran data folder not found');
    return { inserted: 0, skipped: 0 };
  }

  const files = fs.readdirSync(commentaryDir).filter(f => f.endsWith('.json'));
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const file of files) {
    const filePath = path.join(commentaryDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const items = [];
    const lang = file.split('.')[0];
    const translator = file.split('.')[1];

    // Handle nested structure: {"quran": {"en.asad": {"1": {...}}}}
    let verses = data;
    if (data.quran) {
      const innerKey = Object.keys(data.quran)[0];
      verses = data.quran[innerKey];
    }
    for (const key in verses) {
      const entry = verses[key];
      if (!entry || !entry.verse) continue;
      items.push({
        content: entry.verse,
        source_ref: `${lang}.${translator} Surah ${entry.surah}:${entry.ayah}`,
        category: 'commentary',
        embedding: '[' + Array(384).fill(0).join(',') + ']'
      });
    }

    let fileInserted = 0;
    let fileSkipped = 0;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const { inserted, skipped } = await insertBatch(db, batch);
      fileInserted += inserted;
      fileSkipped += skipped;
    }
    totalInserted += fileInserted;
    totalSkipped += fileSkipped;
    console.log(`  ✅ ${file}: ${fileInserted} inserted, ${fileSkipped} skipped`);
  }

  console.log(`\n  ✅ Commentary Total: ${totalInserted} inserted, ${totalSkipped} skipped`);
  return { inserted: totalInserted, skipped: totalSkipped };
}

// ─── Main ───
async function main() {
  console.log('🔍 Hujjah Data Sync');
  console.log('='.repeat(50));

  // Init DB
  console.log('\n🗄️  Connecting to database...');
  const db = await PGlite.create({
    dataDir: path.join(process.cwd(), 'public', 'hujjah-vault'),
    relaxedDurability: true,
    extensions: { vector }
  });

  // Ensure schema
  await db.exec(`
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE IF NOT EXISTS knowledge (
      id          SERIAL PRIMARY KEY,
      content     TEXT        NOT NULL,
      source_ref  TEXT        NOT NULL,
      category    TEXT        NOT NULL,
      embedding   VECTOR(384),
      created_at  TIMESTAMP   DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category);
  `);

  // Check current counts
  const totalRes = await db.query('SELECT count(*) AS count FROM knowledge');
  const currentTotal = parseInt(totalRes.rows[0].count);
  console.log(`  Current records: ${currentTotal.toLocaleString()}`);

  // Import everything
  const quran = await importQuran(db);
  const books = await importBooks(db);
  const commentary = await importCommentary(db);

  // Final stats
  const finalRes = await db.query('SELECT count(*) AS count FROM knowledge');
  const finalTotal = parseInt(finalRes.rows[0].count);

  console.log('\n' + '='.repeat(50));
  console.log('📋 SYNC COMPLETE\n');
  console.log(`  Before: ${currentTotal.toLocaleString()}`);
  console.log(`  After:  ${finalTotal.toLocaleString()}`);
  console.log(`  Added:  ${(finalTotal - currentTotal).toLocaleString()}`);
  console.log(`\n  Quran:      ${quran.inserted} inserted, ${quran.skipped} skipped`);
  console.log(`  Books:      ${books.inserted} inserted, ${books.skipped} skipped`);
  console.log(`  Commentary: ${commentary.inserted} inserted, ${commentary.skipped} skipped`);

  await db.close();
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
