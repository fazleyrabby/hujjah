#!/usr/bin/env node
/**
 * Fast BGE-M3 Embedding Regenerator
 * Uses worker threads for parallel processing
 */

import Database from 'better-sqlite3';
import { env, pipeline } from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DB_PATH = path.join(process.cwd(), 'src-tauri', 'resources', 'hujjah-quran.db');

env.localModelPath = path.join(process.cwd(), 'src-tauri', 'resources', 'models');
env.allowRemoteModels = false;

const db = new Database(DB_PATH);

// ─── 1. Clear old embeddings ───
console.log('🧹 Clearing old embeddings...');
db.exec('UPDATE translations SET embedding = NULL;');
db.exec('VACUUM;');
console.log('  ✅ Cleared');

// ─── 2. Load BGE-M3 ───
console.log('\n📦 Loading BGE-M3...');
const extractor = await pipeline('feature-extraction', 'bge-m3', {
  quantized: true,
  local_files_only: true,
});
console.log('  ✅ Loaded (1024-dim)');

// ─── 3. Fetch translations ───
console.log('\n📖 Fetching translations...');
const rows = db.prepare(`
  SELECT t.id, t.text, t.lang_code 
  FROM translations t
  JOIN verses v ON v.id = t.verse_id
  WHERE t.lang_code IN ('en', 'bn')
  ORDER BY t.id
`).all();

console.log(`  ✅ ${rows.length} translations`);

// ─── 4. Process with concurrency ───
const CONCURRENCY = Math.min(os.cpus().length, 4);
const BATCH_SIZE = 64;
const total = rows.length;
let processed = 0;
let errors = 0;

const updateStmt = db.prepare('UPDATE translations SET embedding = ? WHERE id = ?');

async function processBatch(batch) {
  try {
    const texts = batch.map(t => t.text);
    const outputs = await extractor(texts, { pooling: 'mean', normalize: true });
    const embeddings = outputs.tolist();
    
    db.exec('BEGIN');
    for (let i = 0; i < batch.length; i++) {
      const embedding = new Float32Array(embeddings[i]);
      updateStmt.run(Buffer.from(embedding.buffer), batch[i].id);
    }
    db.exec('COMMIT');
    
    return batch.length;
  } catch (err) {
    console.error(`  ❌ Batch error:`, err.message);
    return 0;
  }
}

console.log(`\n🚀 Processing with ${CONCURRENCY} workers, ${BATCH_SIZE} batch size...\n`);

const startTime = Date.now();

// Process in chunks with concurrency
for (let i = 0; i < total; i += BATCH_SIZE * CONCURRENCY) {
  const batches = [];
  for (let w = 0; w < CONCURRENCY; w++) {
    const start = i + w * BATCH_SIZE;
    if (start < total) {
      batches.push(rows.slice(start, Math.min(start + BATCH_SIZE, total)));
    }
  }
  
  const results = await Promise.all(batches.map(processBatch));
  const batchProcessed = results.reduce((a, b) => a + b, 0);
  processed += batchProcessed;
  if (batchProcessed < batches.flat().length) {
    errors += batches.flat().length - batchProcessed;
  }
  
  const pct = ((processed / total) * 100).toFixed(1);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const rate = (processed / (Date.now() - startTime) * 1000).toFixed(0);
  
  if (i % (BATCH_SIZE * CONCURRENCY * 10) === 0 || processed >= total) {
    console.log(`  📊 ${processed}/${total} (${pct}%) | ${elapsed}s | ${rate}/sec | Errors: ${errors}`);
  }
}

// ─── 5. Verify ───
console.log('\n🔍 Verification:');
const stats = db.prepare(`
  SELECT lang_code, COUNT(*) as total, COUNT(embedding) as with_emb
  FROM translations WHERE lang_code IN ('en', 'bn') GROUP BY lang_code
`).all();

for (const row of stats) {
  const pct = Math.round((row.with_emb / row.total) * 100);
  console.log(`  ${row.lang_code}: ${row.with_emb}/${row.total} (${pct}%)`);
}

const sample = db.prepare('SELECT embedding FROM translations WHERE embedding IS NOT NULL LIMIT 1').get();
if (sample) {
  console.log(`  Dimension: ${sample.embedding.length / 4} (expected: 1024)`);
}

console.log(`\n✅ Done! ${processed} processed, ${errors} errors in ${((Date.now()-startTime)/1000).toFixed(0)}s`);
db.close();
