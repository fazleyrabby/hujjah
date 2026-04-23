#!/usr/bin/env ts-node
/**
 * Generate 384-dim embeddings for all English translations.
 * Uses local ONNX model in src-tauri/resources/models.
 *
 * Run: npx ts-node scripts/generate-embeddings.ts
 */

import Database from 'better-sqlite3';
import { env, pipeline } from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'src-tauri', 'resources', 'hujjah-quran.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('Database not found:', DB_PATH);
  process.exit(1);
}

// Configure local model path
env.localModelPath = path.join(process.cwd(), 'src-tauri', 'resources', 'models');
env.allowRemoteModels = false;

const db = new Database(DB_PATH);

async function main() {
  console.log('🔥 Embedding Generation');
  console.log('=======================');
  console.log(`Model: ${env.localModelPath}/all-MiniLM-L6-v2`);
  console.log(`DB: ${DB_PATH}`);

  // Load model
  console.log('\n📦 Loading model...');
  const extractor = await pipeline('feature-extraction', 'all-MiniLM-L6-v2', {
    quantized: true,
  });
  console.log('  ✅ Model loaded');

  // Count English translations
  const countRow = db.prepare("SELECT COUNT(*) as c FROM translations WHERE lang_code = 'en' AND embedding IS NULL").get() as { c: number };
  const total = countRow.c;
  console.log(`\n📝 English translations to embed: ${total.toLocaleString()}`);

  if (total === 0) {
    console.log('  ✅ All embeddings already generated');
    db.close();
    return;
  }

  // Fetch rows in batches
  const BATCH_SIZE = 100;
  const updateStmt = db.prepare('UPDATE translations SET embedding = ? WHERE id = ?');

  let processed = 0;
  let lastId = 0;

  while (true) {
    const rows = db.prepare(
      "SELECT id, text FROM translations WHERE lang_code = 'en' AND embedding IS NULL AND id > ? ORDER BY id LIMIT ?"
    ).all(lastId, BATCH_SIZE) as { id: number; text: string }[];

    if (rows.length === 0) break;

    // Generate embeddings for batch
    const texts = rows.map((r) => r.text);
    const outputs = await extractor(texts, { pooling: 'mean', normalize: true });
    const embeddings: number[][] = outputs.tolist();

    // Update DB in a transaction
    const updateBatch = db.transaction((items: { id: number; emb: Buffer }[]) => {
      for (const item of items) {
        updateStmt.run(item.emb, item.id);
      }
    });

    const items = rows.map((r, i) => {
      const vec = embeddings[i];
      const buffer = Buffer.from(new Float32Array(vec).buffer);
      return { id: r.id, emb: buffer };
    });

    updateBatch(items);

    processed += rows.length;
    lastId = rows[rows.length - 1].id;

    // Progress bar
    const pct = Math.min(100, Math.round((processed / total) * 100));
    const filled = Math.round(pct / 2);
    const empty = 50 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    process.stdout.write(`\r  [${bar}] ${pct}% (${processed.toLocaleString()}/${total.toLocaleString()})`);
  }

  console.log('');
  console.log('\n✅ Embedding generation complete!');

  // Verify
  const verified = db.prepare("SELECT COUNT(*) as c FROM translations WHERE lang_code = 'en' AND embedding IS NOT NULL").get() as { c: number };
  console.log(`  ${verified.c.toLocaleString()} English translations now have embeddings`);

  db.exec('VACUUM;');
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
