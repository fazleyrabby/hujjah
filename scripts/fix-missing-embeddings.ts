#!/usr/bin/env ts-node
/**
 * Generate embeddings for translations that don't have them yet.
 */

import Database from 'better-sqlite3';
import { env, pipeline } from '@huggingface/transformers';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'src-tauri', 'resources', 'hujjah-quran.db');

env.localModelPath = path.join(process.cwd(), 'src-tauri', 'resources', 'models');
env.allowRemoteModels = false;

const db = new Database(DB_PATH);

async function main() {
  const rows = db.prepare("SELECT id, text FROM translations WHERE lang_code = 'en' AND embedding IS NULL").all() as { id: number; text: string }[];
  console.log(`Generating embeddings for ${rows.length} missing translations...`);

  if (rows.length === 0) {
    console.log('Nothing to do.');
    db.close();
    return;
  }

  const extractor = await pipeline('feature-extraction', 'bge-m3', { quantized: true });
  const updateStmt = db.prepare('UPDATE translations SET embedding = ? WHERE id = ?');
  const BATCH_SIZE = 100;
  let processed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
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

    const pct = Math.round((processed / rows.length) * 100);
    const filled = Math.round(pct / 2);
    const bar = '█'.repeat(filled) + '░'.repeat(50 - filled);
    process.stdout.write(`\r  [${bar}] ${pct}% (${processed}/${rows.length})`);
  }

  console.log('');
  console.log('Done!');
  db.close();
}

main().catch(console.error);
