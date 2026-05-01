#!/usr/bin/env node
/**
 * scripts/translate-narrator-names.js
 *
 * Batch-translate Arabic narrator names → English + Bengali using Qwen on port 8081.
 * Updates narrators in hujjah-hadith-core.db where name_en/name_bn is NULL.
 *
 * Usage:
 *   node scripts/translate-narrator-names.js [--dry-run] [--limit=N] [--offset=N]
 *
 * Dry run (preview only, no DB writes):
 *   node scripts/translate-narrator-names.js --dry-run --limit=20
 *
 * Full run:
 *   node scripts/translate-narrator-names.js
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../apps/tauri/src-tauri/resources/hujjah-hadith-core.db');

const API_URL = process.env.OLLAMA_URL ?? 'http://localhost:8081/v1/chat/completions';
const MODEL = process.env.OLLAMA_MODEL ?? '/Users/rabbi/ai/models/Qwen3.5-9B-OptiQ-4bit';
const BATCH_SIZE = 25;
const MAX_RETRIES = 2;

// ─────────────────────────────────────────────────────────────

if (!existsSync(DB_PATH)) {
  console.error(`DB not found at: ${DB_PATH}`);
  console.error('Set DB_PATH env var or run from repo root');
  process.exit(1);
}

const db = new Database(DB_PATH);

// ── Helpers ───────────────────────────────────────────────────

async function translateBatch(names_ar) {
  const prompt = `You are a translator for Islamic hadith narrator names.

For each Arabic narrator name below, provide BOTH:
1. English transliteration (standard academic format)
2. Bengali transliteration (বাংলা অনুবাদ)

Respond EXACTLY one line per name, in this format (no extra text):
ARABIC_NAME | English Transliteration | বাংলা অনুবাদ

Rules:
- Use proper Arabic diacritics removal in transliteration (e.g., ibn, not "ibn")
- Bengali: transliterate the NAME only (not "son of" — write ইবনে)
- Keep Arabic names as-is in the first column
- If a name has kunya (like Abu), keep it: أبو بكر → আবু বকর

Names to translate:
${names_ar.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: 'You are a precise Islamic names translator.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 800,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? '';
      return text.trim();
    } catch (err) {
      attempt++;
      console.error(`  ⚠ attempt ${attempt} failed: ${err.message}`);
      if (attempt >= MAX_RETRIES) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

function parseResponse(responseText, count) {
  const lines = responseText.split('\n').filter(l => l.trim());
  const results = [];

  for (const line of lines) {
    // Format: "ARABIC | English | বাংলা"
    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 3) {
      results.push({
        name_ar: parts[0],
        name_en: parts[1],
        name_bn: parts[2],
      });
    }
  }

  // If parsing failed, try fallback: one result per input
  if (results.length < count) {
    const allLines = responseText.split('\n');
    for (let i = 0; i < count && i < allLines.length; i++) {
      const parts = allLines[i].split('|').map(p => p.trim());
      if (parts.length >= 3) {
        results.push({ name_ar: parts[0], name_en: parts[1], name_bn: parts[2] });
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
const offsetArg = process.argv.find(a => a.startsWith('--offset='));

const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 0;
const offset = offsetArg ? parseInt(offsetArg.split('=')[1]) : 0;

if (dryRun) {
  console.log('🔍 DRY RUN — no DB writes will occur\n');
}

// Count missing
const totalMissing = db.prepare(
  "SELECT COUNT(*) as cnt FROM narrators WHERE name_en IS NULL OR name_bn IS NULL"
).get().cnt;

console.log(`📊 Total narrators missing translations: ${totalMissing.toLocaleString()}`);

if (limit) console.log(`📊 Processing limit: ${limit}`);
if (offset) console.log(`📊 Starting at offset: ${offset}`);

// Fetch narrators with missing translations
let query = "SELECT id, name_ar FROM narrators WHERE name_en IS NULL OR name_bn IS NULL";
const params = [];

if (offset) {
  query += " ORDER BY id LIMIT ? OFFSET ?";
  params.push(limit || 0xFFFFFFFF, offset);
} else if (limit) {
  query += " ORDER BY id LIMIT ?";
  params.push(limit);
} else {
  query += " ORDER BY id";
}

const narrators = db.prepare(query).all(...params);
console.log(`📊 Fetched ${narrators.length} narrators to process\n`);

if (narrators.length === 0) {
  console.log('✅ Nothing to process');
  process.exit(0);
}

// Process in batches
const updateStmt = db.prepare(
  "UPDATE narrators SET name_en = ?, name_bn = ?, data_source = 'qwen-translated' WHERE id = ?"
);

const updateMany = db.transaction((rows) => {
  for (const row of rows) {
    updateStmt.run(row.name_en, row.name_bn, row.id);
  }
});

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
    await sleep(200); // brief pause to avoid hammering

    const translations = parseResponse(raw, batch.length);
    console.log(`  → Got ${translations.length} translations`);

    let wrote = 0;
    for (const t of translations) {
      // Match by Arabic name (some narrators may have same name)
      const match = batch.find(n => n.name_ar === t.name_ar || t.name_ar.includes(n.name_ar) || n.name_ar.includes(t.name_ar));
      if (match && t.name_en && t.name_bn) {
        if (dryRun) {
          console.log(`  dry-run: would set id=${match.id} → en="${t.name_en}" bn="${t.name_bn}"`);
        } else {
          updateStmt.run(t.name_en, t.name_bn, match.id);
        }
        wrote++;
      } else {
        skipped++;
      }
    }

    if (!dryRun) {
      for (const t of translations) {
        const match = batch.find(n => n.name_ar === t.name_ar && t.name_en && t.name_bn);
        if (match) updateStmt.run(t.name_en, t.name_bn, match.id);
      }
    }

    processed += wrote;
    console.log(`  ✓ wrote ${wrote}, skipped ${batch.length - wrote}\n`);
  } catch (err) {
    console.error(`  ✗ batch failed: ${err.message}\n`);
  }
}

console.log(`\n✅ Done. Processed: ${processed}, Skipped: ${skipped}`);

if (dryRun) {
  console.log('\n⚠️  This was a dry run. Run without --dry-run to write to DB.');
}

db.close();
