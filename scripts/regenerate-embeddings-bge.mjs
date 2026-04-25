#!/usr/bin/env node
/**
 * Regenerate ALL embeddings using BGE-M3
 * 
 * This script:
 * 1. Clears old embeddings (dimension mismatch: 384 → 1024)
 * 2. Loads BGE-M3 model
 * 3. Generates embeddings for ALL languages (en + bn)
 * 4. Saves to database
 * 
 * Run: node scripts/regenerate-embeddings-bge.mjs
 */

import Database from 'better-sqlite3';
import { env, pipeline } from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'src-tauri', 'resources', 'hujjah-quran.db');
const MODEL_PATH = path.join(process.cwd(), 'src-tauri', 'resources', 'models', 'bge-m3');

if (!fs.existsSync(DB_PATH)) {
  console.error('Database not found:', DB_PATH);
  process.exit(1);
}

// Configure local model path
env.localModelPath = path.join(process.cwd(), 'src-tauri', 'resources', 'models');
env.allowRemoteModels = false;

const db = new Database(DB_PATH);

// ─── 1. Clear old embeddings ───
console.log('🧹 Clearing old embeddings (384-dim → 1024-dim)...');
db.exec('UPDATE translations SET embedding = NULL;');
console.log('  ✅ All embeddings cleared');

// ─── 2. Load BGE-M3 model ───
console.log('\n📦 Loading BGE-M3 model...');
const extractor = await pipeline('feature-extraction', 'bge-m3', {
  quantized: true,
  local_files_only: true,
});
console.log('  ✅ BGE-M3 loaded (1024-dim)');

// ─── 3. Get all translations ───
console.log('\n📖 Fetching translations...');
const translations = db.prepare(`
  SELECT t.id, t.text, t.lang_code, t.translator_slug, v.surah, v.ayah
  FROM translations t
  JOIN verses v ON v.id = t.verse_id
  WHERE t.lang_code IN ('en', 'bn')
  ORDER BY t.lang_code, v.surah, v.ayah
`).all();

console.log(`  ✅ ${translations.length} translations to process`);

// ─── 4. Process in batches ───
const BATCH_SIZE = 32;
const total = translations.length;
let processed = 0;
let errors = 0;

const updateStmt = db.prepare('UPDATE translations SET embedding = ? WHERE id = ?');

db.exec('BEGIN TRANSACTION');

for (let i = 0; i < total; i += BATCH_SIZE) {
  const batch = translations.slice(i, i + BATCH_SIZE);
  const texts = batch.map(t => t.text);
  
  try {
    // Generate embeddings for batch
    const outputs = await extractor(texts, { 
      pooling: 'mean', 
      normalize: true 
    });
    
    const embeddings = outputs.tolist();
    
    // Save to database
    for (let j = 0; j < batch.length; j++) {
      const embedding = new Float32Array(embeddings[j]);
      const buffer = Buffer.from(embedding.buffer);
      updateStmt.run(buffer, batch[j].id);
    }
    
    processed += batch.length;
    
    if (i % 640 === 0 || i + BATCH_SIZE >= total) {
      const pct = Math.round((processed / total) * 100);
      console.log(`  📊 ${processed}/${total} (${pct}%) — ${batch[0].lang_code} ${batch[0].surah}:${batch[0].ayah}`);
    }
  } catch (err) {
    console.error(`  ❌ Error processing batch ${i}:`, err.message);
    errors += batch.length;
  }
}

db.exec('COMMIT');

// ─── 5. Verify ───
console.log('\n🔍 Verification...');
const stats = db.prepare(`
  SELECT 
    lang_code,
    COUNT(*) as total,
    COUNT(embedding) as with_embedding
  FROM translations
  WHERE lang_code IN ('en', 'bn')
  GROUP BY lang_code
`).all();

for (const row of stats) {
  const pct = Math.round((row.with_embedding / row.total) * 100);
  console.log(`  ${row.lang_code}: ${row.with_embedding}/${row.total} (${pct}%)`);
}

// Check embedding dimension
const sample = db.prepare('SELECT embedding FROM translations WHERE embedding IS NOT NULL LIMIT 1').get();
if (sample) {
  const dim = sample.embedding.length / 4; // Float32 = 4 bytes
  console.log(`  Dimension: ${dim} (expected: 1024)`);
}

console.log(`\n✅ Done! Processed: ${processed}, Errors: ${errors}`);
db.close();
