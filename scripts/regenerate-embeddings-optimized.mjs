#!/usr/bin/env node
/**
 * Ultra-fast BGE-M3 embedding regeneration
 * Optimized SQLite settings + larger batches
 */

import Database from 'better-sqlite3';
import { env, pipeline } from '@huggingface/transformers';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'src-tauri', 'resources', 'hujjah-quran.db');

env.localModelPath = path.join(process.cwd(), 'src-tauri', 'resources', 'models');
env.allowRemoteModels = false;

const db = new Database(DB_PATH);

// ─── SQLite Performance Optimizations ───
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = OFF;
  PRAGMA cache_size = -64000;
  PRAGMA temp_store = MEMORY;
  PRAGMA mmap_size = 268435456;
`);

// ─── 1. Clear old embeddings ───
console.log('🧹 Clearing old embeddings...');
db.exec('UPDATE translations SET embedding = NULL;');
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
  WHERE t.lang_code IN ('en', 'bn')
  ORDER BY t.id
`).all();

console.log(`  ✅ ${rows.length} translations`);

// ─── 4. Process in LARGE batches ───
const BATCH_SIZE = 256;
const total = rows.length;
let processed = 0;

const updateStmt = db.prepare('UPDATE translations SET embedding = ? WHERE id = ?');

const startTime = Date.now();

for (let i = 0; i < total; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  const texts = batch.map(t => t.text);
  
  // Generate embeddings
  const outputs = await extractor(texts, { pooling: 'mean', normalize: true });
  const embeddings = outputs.tolist();
  
  // Bulk insert in single transaction
  const insert = db.transaction(() => {
    for (let j = 0; j < batch.length; j++) {
      const embedding = new Float32Array(embeddings[j]);
      updateStmt.run(Buffer.from(embedding.buffer), batch[j].id);
    }
  });
  insert();
  
  processed += batch.length;
  
  if (i % (BATCH_SIZE * 10) === 0 || processed >= total) {
    const pct = ((processed / total) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (processed / (Date.now() - startTime) * 1000).toFixed(0);
    console.log(`  📊 ${processed}/${total} (${pct}%) | ${elapsed}s | ${rate}/sec`);
  }
}

// Restore safe settings
db.exec(`PRAGMA synchronous = NORMAL;`);

// ─── 5. Verify ───
console.log('\n🔍 Verification:');
const stats = db.prepare(`
  SELECT lang_code, COUNT(*) as total, COUNT(embedding) as with_emb
  FROM translations WHERE lang_code IN ('en', 'bn') GROUP BY lang_code
`).all();

for (const row of stats) {
  console.log(`  ${row.lang_code}: ${row.with_emb}/${row.total}`);
}

const sample = db.prepare('SELECT embedding FROM translations WHERE embedding IS NOT NULL LIMIT 1').get();
if (sample) {
  console.log(`  Dimension: ${sample.embedding.length / 4}`);
}

console.log(`\n✅ Done in ${((Date.now()-startTime)/1000).toFixed(0)}s`);
db.close();
