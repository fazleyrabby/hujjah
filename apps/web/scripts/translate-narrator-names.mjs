#!/usr/bin/env node
/**
 * apps/web/scripts/translate-narrator-names.mjs
 *
 * Batch-translate Arabic narrator names → English + Bengali using Qwen on port 8081.
 * Updates narrators in hujjah-hadith-core.db where name_en/name_bn is NULL.
 *
 * Usage (from repo root):
 *   node apps/web/scripts/translate-narrator-names.mjs [--dry-run] [--limit=N]
 *
 * Dry run (preview only, no DB writes):
 *   node apps/web/scripts/translate-narrator-names.mjs --dry-run --limit=10
 *
 * Full run:
 *   node apps/web/scripts/translate-narrator-names.mjs
 */

import { existsSync } from 'fs';
import { createRequire } from 'module';
import process from 'process';

const require = createRequire(import.meta.url);

// Load better-sqlite3 from workspace node_modules
let betterSqlite3;
try {
  betterSqlite3 = require('better-sqlite3');
} catch {
  try {
    betterSqlite3 = require('../../node_modules/better-sqlite3');
  } catch {
    betterSqlite3 = require('better-sqlite3');
  }
}

const Database = betterSqlite3;
const DB_PATH = process.env.DB_PATH ?? './data/hujjah-hadith-core.db';
const API_URL = process.env.OLLAMA_URL ?? 'http://localhost:8081/v1/chat/completions';
const MODEL = process.env.OLLAMA_MODEL ?? '/Users/rabbi/ai/models/Qwen3.5-9B-OptiQ-4bit';
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

// ─────────────────────────────────────────────────────────────

if (!existsSync(DB_PATH)) {
  console.error(`DB not found at: ${DB_PATH}`);
  console.error('Set DB_PATH env var or run from apps/web directory');
  process.exit(1);
}

const db = new Database(DB_PATH);

// ── Helpers ───────────────────────────────────────────────────

async function translateBatch(names_ar) {
  const prompt = `You are a translator for Islamic hadith narrator names.

For each Arabic narrator name below, provide BOTH:
1. English transliteration (standard academic format)
2. Bengali transliteration

Respond EXACTLY one line per name, in this format (no extra text, no numbers):
ARABIC_NAME | English Transliteration | বাংলা অনুবাদ

Rules:
- Use standard academic Arabic transliteration (e.g., ibn, not "bin")
- Bengali: transliterate the NAME only (write ইবনে for "son of")
- Keep Arabic names as-is in the first column
- If a name has kunya (like Abu), keep it: Abu Bakr not "Father of Bakr"
- NO explanation, NO markdown, NO preamble

Names to translate:
${names_ar.join('\n')}`;

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: 'You are a precise Islamic names translator. Respond only with translations, one per line.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 600,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? '';
    } catch (err) {
      attempt++;
      console.error(`  ⚠ attempt ${attempt} failed: ${err.message}`);
      if (attempt >= MAX_RETRIES) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

function normalizeArabic(str) {
  return str
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}

function parseResponse(responseText, batch) {
  const lines = responseText.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const results = [];
  const batchMap = new Map(batch.map(n => [normalizeArabic(n.name_ar), n]));

  for (const line of lines) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 3) {
      const [name_ar, name_en, name_bn] = parts;
      const normKey = normalizeArabic(name_ar);
      const match = batchMap.get(normKey);
      if (match && name_en && name_bn) {
        results.push({ id: match.id, name_ar: match.name_ar, name_en, name_bn });
      }
    }
  }
  return results;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Main ───────────────────────────────────────────────────────

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 0;

if (dryRun) {
  console.log('🔍 DRY RUN — no DB writes will occur\n');
}

// Count missing
const totalMissing = db.prepare(
  "SELECT COUNT(*) as cnt FROM narrators WHERE name_en IS NULL OR name_bn IS NULL"
).get().cnt;

console.log(`📊 Total narrators missing translations: ${totalMissing.toLocaleString()}`);

// Fetch narrators with missing translations
let query = "SELECT id, name_ar FROM narrators WHERE name_en IS NULL OR name_bn IS NULL";
const params = [];

if (limit) {
  query += " ORDER BY id LIMIT ?";
  params.push(limit);
} else {
  query += " ORDER BY id";
}

const narrators = db.prepare(query).all(...params);
console.log(`📊 Fetched ${narrators.length} narrators to process\n`);

if (narrators.length === 0) {
  console.log('✅ Nothing to process');
  db.close();
  process.exit(0);
}

const updateStmt = db.prepare(
  "UPDATE narrators SET name_en = ?, name_bn = ?, data_source = 'qwen-translated' WHERE id = ?"
);

let processed = 0;
let skipped = 0;

for (let i = 0; i < narrators.length; i += BATCH_SIZE) {
  const batch = narrators.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(narrators.length / BATCH_SIZE);

  const names_ar = batch.map(n => n.name_ar);
  console.log(`[${batchNum}/${totalBatches}] Translating ${batch.length} names...`);

  try {
    const raw = await translateBatch(names_ar);
    await sleep(500);

    const translations = parseResponse(raw, batch);
    console.log(`  → Got ${translations.length} translations`);

    for (const t of translations) {
      if (dryRun) {
        console.log(`  dry-run: would set id=${t.id} → en="${t.name_en}" bn="${t.name_bn}"`);
      } else {
        updateStmt.run(t.name_en, t.name_bn, t.id);
      }
      processed++;
    }

    skipped += batch.length - translations.length;
    if (skipped > 0) console.log(`  ⚠ skipped ${batch.length - translations.length}`);
  } catch (err) {
    console.error(`  ✗ batch failed: ${err.message}`);
  }
}

console.log(`\n✅ Done. Processed: ${processed}, Skipped: ${skipped}`);

if (dryRun) {
  console.log('\n⚠️  Run without --dry-run to write to DB.');
}

db.close();
