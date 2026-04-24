#!/usr/bin/env ts-node
/**
 * Fast Embedding Generation — Single Process, Large Batches
 *
 * Optimizations:
 * 1. Fetch ALL texts upfront (no repeated SQL queries)
 * 2. Process in large batches (200-500)
 * 3. Write back in one transaction per batch
 *
 * Run: npx ts-node --esm scripts/generate-embeddings-fast.ts --force
 */

import Database from 'better-sqlite3';
import { env, pipeline } from '@huggingface/transformers';
import * as path from 'path';

const DB_PATH = path.join(process.cwd(), 'src-tauri', 'resources', 'hujjah-quran.db');
const EMBEDDING_MODEL = 'bge-m3';
const BATCH_SIZE = 200; // Much larger = less overhead

env.localModelPath = path.join(process.cwd(), 'src-tauri', 'resources', 'models');
env.allowRemoteModels = false;

async function main() {
  console.log('🔥 Fast Embedding Generation');
  console.log('=============================');
  console.log(`Model: ${EMBEDDING_MODEL}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`DB: ${DB_PATH}`);

  const db = new Database(DB_PATH);

  if (process.argv.includes('--force')) {
    console.log('\n🗑️  Clearing existing embeddings...');
    db.prepare("UPDATE translations SET embedding = NULL WHERE lang_code = 'en'").run();
    console.log('  ✅ Cleared');
  }

  // Load model
  console.log('\n📦 Loading model...');
  const loadStart = Date.now();
  const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, {
    quantized: true,
  });
  console.log(`  ✅ Model loaded in ${Date.now() - loadStart}ms`);

  // Fetch ALL rows that need embeddings into memory
  console.log('\n📖 Fetching texts from database...');
  const rows = db.prepare(
    "SELECT id, text FROM translations WHERE lang_code = 'en' AND embedding IS NULL ORDER BY id"
  ).all() as { id: number; text: string }[];

  const total = rows.length;
  console.log(`  ${total.toLocaleString()} texts to embed`);

  if (total === 0) {
    console.log('✅ All embeddings already generated');
    db.close();
    return;
  }

  // Process in large batches
  const updateStmt = db.prepare('UPDATE translations SET embedding = ? WHERE id = ?');
  let processed = 0;
  const start = Date.now();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const texts = batch.map((r) => r.text);

    // Generate embeddings
    const outputs = await extractor(texts, { pooling: 'mean', normalize: true });
    const embeddings: number[][] = outputs.tolist();

    // Write all in one transaction
    const writeTx = db.transaction((items: { id: number; emb: Buffer }[]) => {
      for (const item of items) {
        updateStmt.run(item.emb, item.id);
      }
    });

    const items = batch.map((r, idx) => ({
      id: r.id,
      emb: Buffer.from(new Float32Array(embeddings[idx]).buffer),
    }));

    writeTx(items);

    processed += batch.length;

    // Progress
    const pct = Math.min(100, Math.round((processed / total) * 100));
    const elapsed = Math.round((Date.now() - start) / 1000);
    const rate = elapsed > 0 ? Math.round(processed / elapsed) : 0;
    const eta = rate > 0 ? Math.round((total - processed) / rate) : 0;
    const bar = '█'.repeat(Math.round(pct / 2)) + '░'.repeat(50 - Math.round(pct / 2));

    process.stdout.write(
      `\r  [${bar}] ${pct}% | ${processed.toLocaleString()}/${total.toLocaleString()} | ${rate}/s | ETA: ${eta}s`
    );
  }

  console.log('');
  console.log(`\n✅ Done in ${Math.round((Date.now() - start) / 1000)}s`);

  // Verify
  const verified = db.prepare(
    "SELECT COUNT(*) as c FROM translations WHERE lang_code = 'en' AND embedding IS NOT NULL"
  ).get() as { c: number };
  console.log(`  ${verified.c.toLocaleString()} English translations have embeddings`);

  db.exec('VACUUM;');
  db.close();
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});