#!/usr/bin/env ts-node
/**
 * scripts/translate-hadith.ts
 *
 * Bulk-translates Arabic hadith matn from hujjah-hadith-core.db
 * using a local MLX model server (OpenAI-compatible API).
 *
 * Target model: mlx-community/Qwen3.5-9B-OptiQ-4bit
 * Server:       mlx_lm.server --model mlx-community/Qwen3.5-9B-OptiQ-4bit
 *               (defaults to http://localhost:8080)
 *
 * Design principles:
 *  - Translates matn_ar ONLY (narrator chains stay in Arabic)
 *  - Strict literal prompt — no paraphrasing, no added commentary
 *  - Preserves Islamic terminology (salat, zakat, etc.) in Arabic
 *  - Fully resumable — skips already-translated rows
 *  - Writes in batches with WAL mode for safe concurrent access
 *  - Hard token cap to prevent runaway generation
 *
 * Usage:
 *   npx ts-node scripts/translate-hadith.ts [options]
 *
 * Options:
 *   --lang     en | bn          (default: en)
 *   --book     "Sahih al-Bukhari" | ... | all   (default: all)
 *   --batch    N                (rows per commit, default: 50)
 *   --limit    N                (max rows to process, default: unlimited)
 *   --host     http://...       (MLX server URL, default: http://localhost:8080)
 *   --dry-run                   (print first 3 prompts, don't translate)
 *   --concurrency N             (parallel requests, default: 3)
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// ─── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag: string, fallback: string): string {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

const LANG        = getArg('--lang', 'en') as 'en' | 'bn';
const BOOK_FILTER = getArg('--book', 'all');
const BATCH_SIZE  = parseInt(getArg('--batch', '50'), 10);
const ROW_LIMIT   = parseInt(getArg('--limit', '0'), 10); // 0 = unlimited
const MLX_HOST    = getArg('--host', 'http://localhost:8080');
const DRY_RUN     = hasFlag('--dry-run');
const CONCURRENCY = Math.max(1, parseInt(getArg('--concurrency', '3'), 10));
const TRANSLATOR  = 'qwen3.5-9b';

if (!['en', 'bn'].includes(LANG)) {
  console.error('--lang must be en or bn');
  process.exit(1);
}

// ─── DB ─────────────────────────────────────────────────────────────────────

const DB_PATH = path.join(
  process.cwd(),
  'src-tauri',
  'resources',
  'hujjah-hadith-core.db'
);

if (!fs.existsSync(DB_PATH)) {
  console.error('DB not found:', DB_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// ─── Types ──────────────────────────────────────────────────────────────────

interface HadithRow {
  id: number;
  book_name_en: string;
  num_in_book: number;
  matn_ar: string;
}

// ─── Prompts ────────────────────────────────────────────────────────────────

/**
 * System prompt enforces literal fidelity.
 * No interpretation, no added context, no summarization.
 */
function systemPrompt(lang: 'en' | 'bn'): string {
  if (lang === 'bn') {
    return `তুমি একজন ক্লাসিক্যাল আরবি থেকে বাংলা অনুবাদক, হাদিস সাহিত্যে বিশেষজ্ঞ।

কঠোর নিয়মাবলি:
- শুধুমাত্র প্রদত্ত আরবি পাঠ্যের আক্ষরিক অনুবাদ করো
- কোনো ব্যাখ্যা, টীকা বা অতিরিক্ত তথ্য যোগ করো না
- ইসলামিক পরিভাষা (সালাত, যাকাত, হজ, জিহাদ, ইমান, উম্মত, ইত্যাদি) আরবিতে রেখে দাও বা বাংলা প্রতিবর্ণীকরণ করো
- আক্ষরিক অর্থ বজায় রাখো, সহজ ভাষায় রূপান্তর করো না
- শুধু অনুবাদ লেখো — কোনো ভূমিকা বা মন্তব্য নয়`;
  }

  return `You are a classical Arabic-to-English translator specializing in hadith literature.

Strict rules:
- Produce a LITERAL translation of the provided Arabic text only
- Do NOT add explanations, commentary, footnotes, or context
- Preserve Islamic terminology in Arabic with transliteration in parentheses where helpful
  e.g. salat (prayer), zakat (almsgiving), hajj, jihad, iman, ummah, rasul, sahabi
- Keep the sentence structure close to the Arabic original
- Render divine epithets as-is: "Allah", "the Prophet (peace be upon him)"
- Output ONLY the translation — no preamble, no labels, no "Translation:" prefix`;
}

function userPrompt(matnAr: string, lang: 'en' | 'bn'): string {
  if (lang === 'bn') {
    return `নিচের হাদিসের মতন (মূল পাঠ্য) অনুবাদ করো:\n\n${matnAr.trim()}`;
  }
  return `Translate the following hadith matn (text body):\n\n${matnAr.trim()}`;
}

// ─── MLX API call ────────────────────────────────────────────────────────────

const MLX_ENDPOINT = `${MLX_HOST}/v1/chat/completions`;

interface MLXResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

async function translateMatn(
  matnAr: string,
  lang: 'en' | 'bn',
  hadithId: number
): Promise<string> {
  const body = {
    model: 'mlx-community/Qwen3-5.9B-Instruct-4bit', // adjust if your server uses a different model name
    messages: [
      { role: 'system', content: systemPrompt(lang) },
      { role: 'user',   content: userPrompt(matnAr, lang) },
    ],
    // Hard cap: matn is rarely > 200 words; 300 tokens is generous
    max_tokens: 300,
    temperature: 0.1,   // near-deterministic for consistency
    top_p: 0.9,
    // Qwen3 thinking mode — disable for translation (we want direct output)
    // If your model supports it, add: "thinking": false
  };

  const res = await fetch(MLX_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000), // 60s per request
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for hadith ${hadithId}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as MLXResponse;
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error(`Empty response for hadith ${hadithId}`);
  }

  // Sanity: translation should be shorter than 5x the Arabic (catches runaway generation)
  if (content.length > matnAr.length * 5) {
    throw new Error(
      `Translation suspiciously long for hadith ${hadithId} ` +
      `(Arabic: ${matnAr.length} chars, output: ${content.length} chars)`
    );
  }

  return content;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO hadith_translations
    (hadith_id, lang_code, matn_text, translator)
  VALUES
    (@hadithId, @langCode, @matnText, @translator)
`);

function fetchPendingRows(lang: string, bookFilter: string, limit: number): HadithRow[] {
  let sql = `
    SELECT
      h.id,
      b.name_en AS book_name_en,
      h.num_in_book,
      h.matn_ar
    FROM hadiths h
    JOIN hadith_books b ON b.id = h.book_id
    WHERE NOT EXISTS (
      SELECT 1 FROM hadith_translations t
      WHERE t.hadith_id = h.id
        AND t.lang_code = ?
        AND t.translator = ?
    )
  `;
  const params: (string | number)[] = [lang, TRANSLATOR];

  if (bookFilter !== 'all') {
    sql += ' AND b.name_en = ?';
    params.push(bookFilter);
  }

  sql += ' ORDER BY b.id, h.num_in_book';

  if (limit > 0) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  return db.prepare(sql).all(...params) as HadithRow[];
}

// ─── Progress tracking ───────────────────────────────────────────────────────

let done = 0;
let errors = 0;
let startTime = Date.now();

function printProgress(total: number): void {
  const elapsed = (Date.now() - startTime) / 1000;
  const rate = done / Math.max(elapsed, 1);
  const remaining = total - done;
  const eta = rate > 0 ? Math.round(remaining / rate) : 0;
  const etaStr = eta > 3600
    ? `${Math.floor(eta / 3600)}h ${Math.floor((eta % 3600) / 60)}m`
    : `${Math.floor(eta / 60)}m ${eta % 60}s`;

  process.stdout.write(
    `\r  [${done}/${total}] ${errors} errors | ${rate.toFixed(1)} req/s | ETA: ${etaStr}   `
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Hadith Bulk Translator ===');
  console.log(`  Lang:        ${LANG}`);
  console.log(`  Book:        ${BOOK_FILTER}`);
  console.log(`  MLX server:  ${MLX_ENDPOINT}`);
  console.log(`  Batch size:  ${BATCH_SIZE}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Translator:  ${TRANSLATOR}`);
  if (DRY_RUN) console.log('  *** DRY RUN — no DB writes ***');
  console.log('');

  // Check server is up
  if (!DRY_RUN) {
    try {
      const ping = await fetch(`${MLX_HOST}/v1/models`, { signal: AbortSignal.timeout(5000) });
      if (!ping.ok) throw new Error(`Status ${ping.status}`);
      console.log('  ✓ MLX server reachable');
    } catch (err) {
      console.error(`  ✗ Cannot reach MLX server at ${MLX_HOST}`);
      console.error(`    Start it with: mlx_lm.server --model mlx-community/Qwen3.5-9B-OptiQ-4bit`);
      console.error(`    Error: ${err}`);
      process.exit(1);
    }
  }

  // Fetch pending rows
  const rows = fetchPendingRows(LANG, BOOK_FILTER, ROW_LIMIT);
  const total = rows.length;

  if (total === 0) {
    console.log('  ✓ Nothing to translate (all rows done or no match)');
    db.close();
    return;
  }

  console.log(`  Rows to translate: ${total.toLocaleString()}\n`);

  // Dry-run: print first 3 prompts and exit
  if (DRY_RUN) {
    const samples = rows.slice(0, 3);
    for (const row of samples) {
      console.log(`--- Hadith ${row.id} (${row.book_name_en} #${row.num_in_book}) ---`);
      console.log('[SYSTEM]', systemPrompt(LANG).split('\n')[0], '...');
      console.log('[USER]', userPrompt(row.matn_ar, LANG));
      console.log('');
    }
    db.close();
    return;
  }

  startTime = Date.now();

  // Process in chunks of BATCH_SIZE, with CONCURRENCY parallel requests per chunk
  for (let batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);
    const batchResults: Array<{ hadithId: number; matnText: string } | null> = [];

    // Process batch with limited concurrency
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY);

      const results = await Promise.allSettled(
        chunk.map((row) => translateMatn(row.matn_ar, LANG, row.id))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const row = chunk[j];

        if (result.status === 'fulfilled') {
          batchResults.push({ hadithId: row.id, matnText: result.value });
          done++;
        } else {
          console.error(
            `\n  ✗ Error hadith ${row.id} (${row.book_name_en} #${row.num_in_book}): ` +
            result.reason?.message ?? result.reason
          );
          errors++;
          batchResults.push(null);
        }
      }

      printProgress(total);
    }

    // Commit batch in a single transaction
    const commitBatch = db.transaction(() => {
      for (const r of batchResults) {
        if (r === null) continue;
        insertStmt.run({
          hadithId:   r.hadithId,
          langCode:   LANG,
          matnText:   r.matnText,
          translator: TRANSLATOR,
        });
      }
    });
    commitBatch();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n  ✓ Done in ${elapsed}s`);
  console.log(`    Translated: ${done}`);
  console.log(`    Errors:     ${errors}`);
  console.log(`    Skipped:    ${total - done - errors}`);

  // Final count
  const countRow = db
    .prepare(`SELECT count(*) as c FROM hadith_translations WHERE lang_code = ?`)
    .get(LANG) as { c: number };
  console.log(`    Total ${LANG.toUpperCase()} translations in DB: ${countRow.c.toLocaleString()}`);

  db.close();
}

main().catch((err) => {
  console.error('\nFatal:', err);
  db.close();
  process.exit(1);
});
