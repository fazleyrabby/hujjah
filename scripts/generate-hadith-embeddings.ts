#!/usr/bin/env ts-node
/**
 * Hadith Embedding Generation — BGE-M3 (1024-dim)
 *
 * Truncates texts to ~2000 chars (BGE-M3's 512-token context window).
 * This actually IMPROVES quality since longer texts dilute semantic focus.
 *
 * Run: npx ts-node --esm scripts/generate-hadith-embeddings.ts
 */

import Database from 'better-sqlite3';
import { env, pipeline } from '@huggingface/transformers';
import * as path from 'path';

const DB_PATH = path.join(process.cwd(), 'src-tauri', 'resources', 'hujjah-hadith-core.db');
const EMBEDDING_MODEL = 'bge-m3';
const BATCH_SIZE = 50;        // Smaller batches for stability
const MAX_TEXT_LEN = 2000;    // ~512 tokens for BGE-M3
const EMBEDDING_DIM = 1024;

env.localModelPath = path.join(process.cwd(), 'src-tauri', 'resources', 'models');
env.allowRemoteModels = false;

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  // Cut at last space to avoid splitting words
  const cut = text.lastIndexOf(' ', maxLen);
  return cut > 0 ? text.slice(0, cut) : text.slice(0, maxLen);
}

async function main() {
  console.log('[Hadith Embeddings] BGE-M3 Generation');
  console.log('[Config] Batch size:', BATCH_SIZE, '| Max text:', MAX_TEXT_LEN, 'chars');

  const db = new Database(DB_PATH);

  // Create embeddings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS hadith_embeddings (
      id INTEGER PRIMARY KEY,
      lang_code TEXT NOT NULL,
      translator TEXT NOT NULL,
      hadith_id INTEGER NOT NULL REFERENCES hadiths(id),
      embedding BLOB NOT NULL,
      UNIQUE(hadith_id, lang_code, translator)
    )
  `);

  const existing = (db.prepare('SELECT COUNT(*) as c FROM hadith_embeddings').get() as { c: number }).c;
  console.log('[Stats] Existing embeddings:', existing);

  // Load model
  console.log('[Model] Loading BGE-M3...');
  const loadStart = Date.now();
  const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, {
    quantized: true,
  });
  console.log('[Model] Loaded in', Date.now() - loadStart, 'ms');

  // Fetch texts needing embeddings
  const rows = db.prepare(`
    SELECT ht.id, ht.hadith_id, ht.lang_code, ht.matn_text, h.matn_ar
    FROM hadith_translations ht
    JOIN hadiths h ON h.id = ht.hadith_id
    WHERE ht.translator = 'github-classic'
      AND (ht.matn_text IS NOT NULL AND ht.matn_text != '')
      AND NOT EXISTS (
        SELECT 1 FROM hadith_embeddings he
        WHERE he.hadith_id = ht.hadith_id
          AND he.lang_code = ht.lang_code
          AND he.translator = ht.translator
      )
    ORDER BY ht.id
  `).all() as {
    id: number;
    hadith_id: number;
    lang_code: string;
    matn_text: string;
    matn_ar: string;
  }[];

  const total = rows.length;
  console.log('[Process]', total, 'texts to embed');

  if (total === 0) {
    console.log('[Done] Nothing to do');
    db.close();
    return;
  }

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO hadith_embeddings (id, lang_code, translator, hadith_id, embedding)
    VALUES (?, ?, 'github-classic', ?, ?)
  `);

  let processed = 0;
  let errors = 0;
  const start = Date.now();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const texts = batch.map((r) => truncateText(r.matn_text || r.matn_ar, MAX_TEXT_LEN));

    try {
      const outputs = await extractor(texts, { pooling: 'mean', normalize: true });
      const embeddings: number[][] = outputs.tolist();

      const writeTx = db.transaction((items: { id: number; hadith_id: number; lang_code: string; emb: Buffer }[]) => {
        for (const item of items) {
          insertStmt.run(item.id, item.lang_code, item.hadith_id, item.emb);
        }
      });

      writeTx(batch.map((r, idx) => ({
        id: r.id,
        lang_code: r.lang_code,
        hadith_id: r.hadith_id,
        emb: Buffer.from(new Float32Array(embeddings[idx]).buffer),
      })));

      processed += batch.length;
    } catch (err) {
      errors += batch.length;
      console.error('[Error]', i, String(err).slice(0, 100));
    }

    const pct = Math.round((processed / total) * 100);
    const elapsed = Date.now() - start;
    const rate = Math.round(processed / (elapsed / 1000));
    const eta = rate > 0 ? Math.round((total - processed) / rate) : 0;
    console.log(`[Progress] ${processed}/${total} (${pct}%) | ${rate}/sec | ETA ${eta}s`);
  }

  const totalTime = Math.round((Date.now() - start) / 1000);
  console.log('[Done] Processed:', processed, '| Errors:', errors, '| Time:', totalTime, 's');
  console.log('[Rate]', Math.round(processed / totalTime), 'embeddings/sec');

  db.close();
}

main().catch(console.error);
