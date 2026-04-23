#!/usr/bin/env node

/**
 * Hujjah Database Seeder
 * Streams 1.3GB Sanadset CSV into PGlite without OOM
 * 
 * Usage: node scripts/seed-vault.mjs
 */

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import cliProgress from 'cli-progress';

// Configuration
const SANADSET_PATH = '/Users/rabbi/Desktop/hujjah resources/Sanadset 650K Data on Hadith Narrators/sanadset.csv';
const BOOKS_PATH = '/Users/rabbi/Desktop/hujjah resources/Sanadset 650K Data on Hadith Narrators/books.csv';
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'hujjah-vault');
const BATCH_SIZE = 500;

// Robust CSV line parser (handles quoted fields with commas)
function parseCSVLine(line) {
  const fields = [];
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
  return fields;
}

// Clean hadith text for embedding
function cleanForEmbedding(text) {
  return text
    .replace(/<SANAD>/g, '')
    .replace(/<\/SANAD>/g, '')
    .replace(/<MATN>/g, '')
    .replace(/<\/MATN>/g, '')
    .replace(/<NAR>/g, '')
    .replace(/<\/NAR>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadBooksMap() {
  console.log('📚 Loading books.csv...');
  const booksMap = new Map();
  
  return new Promise((resolve, reject) => {
    const stream = createReadStream(BOOKS_PATH, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let isFirstLine = true;
    
    rl.on('line', (line) => {
      if (isFirstLine) {
        isFirstLine = false;
        return; // Skip header
      }
      
      const bookName = line.trim();
      if (bookName) {
        // Use book name as key (Sanadset uses book name, not ID)
        booksMap.set(bookName, bookName);
      }
    });
    
    rl.on('close', () => {
      console.log(`✓ Loaded ${booksMap.size} books`);
      resolve(booksMap);
    });
    
    rl.on('error', reject);
  });
}

async function insertBatch(db, batch) {
  if (batch.length === 0) return;

  const values = batch
    .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
    .join(', ');
  
  const queryParams = batch.flatMap(b => [b.content, b.source_ref, b.category]);
  
  await db.query(`
    INSERT INTO knowledge (content, source_ref, category)
    VALUES ${values}
  `, queryParams);
}

function getDirectorySize(dirPath) {
  let size = 0;
  
  function walk(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        size += fs.statSync(fullPath).size;
      }
    }
  }
  
  walk(dirPath);
  return size;
}

async function seedDatabase() {
  console.log('🕌 Hujjah Database Seeder\n');
  console.log('📂 Input:', SANADSET_PATH);
  console.log('📁 Output:', OUTPUT_DIR);
  console.log('📦 Batch Size:', BATCH_SIZE);
  console.log('');

  // Check if file exists
  if (!fs.existsSync(SANADSET_PATH)) {
    console.error('❌ Sanadset file not found:', SANADSET_PATH);
    process.exit(1);
  }

  // Get file size for progress
  const fileSize = fs.statSync(SANADSET_PATH).size;
  console.log('📊 File size:', (fileSize / 1024 / 1024).toFixed(2), 'MB');

  // Create output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    console.log('🗑️  Removing existing vault...');
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Initialize PGlite with local disk storage
  console.log('\n🗄️  Initializing PGlite...');
  const db = await PGlite.create({
    dataDir: OUTPUT_DIR,
    relaxedDurability: true,
    extensions: { vector }
  });

  // Create schema with FTS
  console.log('📝 Creating schema...');
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
    
    -- Category index
    CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category);
  `);

  // Load books map
  const booksMap = await loadBooksMap();

  // Stream and process Sanadset
  console.log('\n📖 Streaming Sanadset CSV...\n');
  
  const progressBar = new cliProgress.SingleBar({
    format: '📊 Progress | {bar} | {percentage}% | {value}/{total} rows | {rate} rows/s',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true
  });

  const stream = createReadStream(SANADSET_PATH, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  
  let lineCount = 0;
  let totalLines = 0;
  let header = '';
  let batch = [];
  let insertedCount = 0;
  let skippedCount = 0;

  // Estimate total lines (rough estimate for progress bar)
  const estimatedLines = 650000;
  progressBar.start(estimatedLines, 0);

  for await (const line of rl) {
    totalLines++;
    
    // First line is header
    if (totalLines === 1) {
      header = line;
      continue;
    }
    
    if (!line.trim()) continue;
    
    const parts = parseCSVLine(line);
    
    // Need at least: Hadith, Book, Num_hadith
    if (parts.length < 3) {
      continue;
    }
    
    const rawContent = parts[0].replace(/^"|"$/g, '').replace(/""/g, '"').trim();
    const book = parts[1].replace(/^"|"$/g, '').trim();
    const number = parts[2].replace(/^"|"$/g, '').trim();
    
    // Skip if no content
    if (!rawContent || !book) {
      continue;
    }
    
    // Clean content for storage
    const cleanedContent = cleanForEmbedding(rawContent);
    
    batch.push({
      content: cleanedContent,
      source_ref: `${book} Hadith #${number}`,
      category: 'hadith'
    });
    
    // Insert batch when full
    if (batch.length >= BATCH_SIZE) {
      await insertBatch(db, batch);
      insertedCount += batch.length;
      batch = [];
      progressBar.update(insertedCount);
    }
    
    lineCount++;
  }

  // Insert remaining batch
  if (batch.length > 0) {
    await insertBatch(db, batch);
    insertedCount += batch.length;
    batch = [];
    progressBar.update(insertedCount);
  }

  progressBar.stop();

  console.log('\n\n📊 Final Statistics:');
  console.log('  Total lines processed:', totalLines.toLocaleString());
  console.log('  Total hadiths imported:', insertedCount.toLocaleString());
  console.log('  Skipped (invalid):', skippedCount.toLocaleString());

  // Verify count
  const countRes = await db.query('SELECT count(*) AS count FROM knowledge');
  const finalCount = parseInt(countRes.rows[0].count);
  console.log('  Database record count:', finalCount.toLocaleString());

  // Create FTS index stats
  console.log('\n🔍 Creating FTS index...');
  await db.exec(`
    UPDATE knowledge SET content_tsv = to_tsvector('simple', content);
    REINDEX INDEX idx_knowledge_content_tsv;
  `);

  await db.close();

  // Get final directory size
  const vaultSize = getDirectorySize(OUTPUT_DIR);
  console.log('\n💾 Vault size:', (vaultSize / 1024 / 1024).toFixed(2), 'MB');
  console.log('\n✅ Seeding complete!');
  console.log('\n📝 Next steps:');
  console.log('   1. Run: npm run build');
  console.log('   2. Deploy public/hujjah-vault with your Next.js app');
  console.log('   3. Frontend will auto-load the pre-seeded vault\n');
}

// Run seeder
seedDatabase().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
