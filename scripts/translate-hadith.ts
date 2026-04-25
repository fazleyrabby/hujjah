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
const CONCURRENCY = Math.max(1, parseInt(getArg('--concurrency', '1'), 10));
const TRANSLATOR  = 'qwen3.5-9b';

// Model path for MLX server. Defaults to the local path; override with env var
// or pass the model served by your MLX instance.
const MLX_MODEL   = process.env.MLX_MODEL_PATH ?? '/Users/rabbi/ai/models/Qwen3.5-9B-OptiQ-4bit';

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

function userPromptBatch(rows: { id: number; matn_ar: string }[], lang: 'en' | 'bn'): string {
  const numbered = rows
    .map((r, i) => `[${i + 1}]\n${r.matn_ar.trim()}`)
    .join('\n\n');

  if (lang === 'bn') {
    return `নিচের ${rows.length}টি হাদিসের মতন আলাদাভাবে অনুবাদ করো।
প্রতিটির আগে [1], [2] ইত্যাদি নম্বর লেখো। শুধু অনুবাদ লেখো।\n\n${numbered}`;
  }
  return `Translate each of the following ${rows.length} hadith matn texts separately.
Prefix each translation with [1], [2], etc. matching the input numbers. Output translations only.\n\n${numbered}`;
}

// ─── MLX API call ────────────────────────────────────────────────────────────

const MLX_ENDPOINT = `${MLX_HOST}/v1/chat/completions`;

interface MLXResponse {
  choices: Array<{
    finish_reason: string;
    message: { content?: string; reasoning?: string };
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

function cleanContent(raw: string): string {
  return raw
    .replace(/<\|im_end\|>[\s\S]*/g, '')
    .replace(/<\|im_start\|>[\s\S]*/g, '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim();
}

/**
 * Translate a batch of hadiths in one API call.
 * Returns array of translations in same order as input rows.
 * Falls back to empty string for any entry that can't be parsed.
 */
async function translateBatch(
  rows: HadithRow[],
  lang: 'en' | 'bn'
): Promise<string[]> {
  const body = {
    model: MLX_MODEL,
    messages: [
      { role: 'system', content: systemPrompt(lang) },
      { role: 'user',   content: userPromptBatch(rows, lang) },
    ],
    // 150 tokens per hadith × batch size + overhead
    max_tokens: rows.length * 150 + 100,
  };

  const res = await fetch(MLX_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000 + rows.length * 30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as MLXResponse;
  const raw = cleanContent(
    (data.choices?.[0]?.message as Record<string, string>)?.content ?? ''
  );

  if (!raw) {
    throw new Error(`Empty batch response (finish_reason: ${data.choices?.[0]?.finish_reason})`);
  }

  // Parse [N] prefixed sections
  const results: string[] = new Array(rows.length).fill('');
  const parts = raw.split(/\[(\d+)\]/);
  // parts: ['', '1', 'translation1', '2', 'translation2', ...]
  for (let i = 1; i < parts.length - 1; i += 2) {
    const idx = parseInt(parts[i], 10) - 1; // 0-based
    if (idx >= 0 && idx < rows.length) {
      results[idx] = parts[i + 1].trim();
    }
  }

  return results;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO hadith_translations
    (hadith_id, lang_code, matn_text, translator)
  VALUES
    (@hadithId, @langCode, @matnText, @translator)
`);

function getTranslationCount(lang: string): number {
  const row = db
    .prepare(`SELECT count(*) as c FROM hadith_translations WHERE lang_code = ?`)
    .get(lang) as { c: number };
  return row.c;
}

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

// ─── In-process matn cache (avoid re-translating identical Arabic text) ─────
// 266 out of 36,327 hadiths share identical matn_ar across books (~1%).
// Cache keyed by matn_ar — saves ~400-500 redundant API calls per run.
const matnCache = new Map<string, string>();

// ─── Progress tracking ───────────────────────────────────────────────────────

let done = 0;
let errors = 0;
let startTime = Date.now();

// ─── Promise pool (lightweight p-limit) ─────────────────────────────────────

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current], current);
    }
  }

  const workers = Array(Math.min(limit, items.length))
    .fill(null)
    .map(() => worker());
  await Promise.all(workers);
  return results;
}

// ─── Process one API batch (used by the pool) ────────────────────────────────

interface ApiBatchResult {
  results: Array<{ hadithId: number; matnText: string } | null>;
  translated: number;
  errCount: number;
}

async function processApiBatch(
  apiBatch: HadithRow[],
  lang: 'en' | 'bn'
): Promise<ApiBatchResult> {
  const batchResults: Array<{ hadithId: number; matnText: string } | null> = [];
  let translated = 0;
  let errCount = 0;

  // Check matn cache — only send uncached rows to API
  const uncached: HadithRow[] = [];
  const cachedMap = new Map<number, string>(); // hadithId → translation
  for (const row of apiBatch) {
    const hit = matnCache.get(row.matn_ar);
    if (hit !== undefined) {
      cachedMap.set(row.id, hit);
    } else {
      uncached.push(row);
    }
  }

  let translations: string[] = [];
  if (uncached.length > 0) {
    try {
      translations = await translateBatch(uncached, lang);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `\n  ✗ Batch error (hadiths ${uncached.map((r) => r.num_in_book).join(',')}): ${msg}`
      );
      uncached.forEach(() => {
        errCount++;
        batchResults.push(null);
      });
      return { results: batchResults, translated, errCount };
    }

    // Retry any entries the model skipped (missing [N] in output)
    const retries = uncached.filter((_, idx) => !translations[idx]);
    if (retries.length > 0) {
      for (const row of retries) {
        const origIdx = uncached.indexOf(row);
        try {
          const single = await translateBatch([row], lang);
          if (single[0]) translations[origIdx] = single[0];
        } catch {
          // will be caught below as missing
        }
      }
    }

    // Populate matn cache for successful translations
    uncached.forEach((row, idx) => {
      if (translations[idx]) matnCache.set(row.matn_ar, translations[idx]);
    });
  }

  // Merge cached + newly translated, preserving order
  let uncachedIdx = 0;
  for (const row of apiBatch) {
    const cached = cachedMap.get(row.id);
    if (cached !== undefined) {
      batchResults.push({ hadithId: row.id, matnText: cached });
      translated++;
    } else {
      const t = translations[uncachedIdx++] ?? '';
      if (t) {
        batchResults.push({ hadithId: row.id, matnText: t });
        translated++;
      } else {
        console.error(
          `\n  ✗ Missing translation for hadith ${row.id} (${row.book_name_en} #${row.num_in_book})`
        );
        errCount++;
        batchResults.push(null);
      }
    }
  }

  return { results: batchResults, translated, errCount };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Hadith Bulk Translator ===');
  console.log(`  Lang:        ${LANG}`);
  console.log(`  Book:        ${BOOK_FILTER}`);
  console.log(`  MLX server:  ${MLX_ENDPOINT}`);
  console.log(`  Batch size:  ${BATCH_SIZE}`);
  console.log(`  API batch:   ${getArg('--api-batch', '10')}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Translator:  ${TRANSLATOR}`);
  console.log(`  Model:       ${MLX_MODEL}`);
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
  const beforeCount = getTranslationCount(LANG);
  const rows = fetchPendingRows(LANG, BOOK_FILTER, ROW_LIMIT);
  const total = rows.length;

  console.log(`  DB ${LANG.toUpperCase()} count before: ${beforeCount.toLocaleString()}`);
  if (total === 0) {
    console.log('  ✓ Nothing to translate (all rows done or no match)');
    db.close();
    return;
  }

  console.log(`  Rows to translate: ${total.toLocaleString()}`);
  console.log(`  DB ${LANG.toUpperCase()} count before: ${beforeCount.toLocaleString()}\n`);

  // API_BATCH: hadiths per API call (amortizes per-request overhead)
  // Safe default: 10 (2× faster than 5, same memory/CPU pressure)
  // Increase to 15 if your MLX server has >16GB RAM
  // Decrease to 5 if you see timeout errors
  const API_BATCH = parseInt(getArg('--api-batch', '10'), 10);

  // Dry-run: show a sample batch prompt and exit
  if (DRY_RUN) {
    const sample = rows.slice(0, Math.min(API_BATCH, 3));
    console.log(`--- Sample batch (${sample.length} hadiths) ---`);
    console.log('[SYSTEM]', systemPrompt(LANG).split('\n')[0], '...');
    console.log('[USER]', userPromptBatch(sample, LANG));
    console.log('');
    db.close();
    return;
  }

  startTime = Date.now();

  // Process rows in DB_BATCH-sized groups, committed every BATCH_SIZE rows
  for (let batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
    const dbBatch = rows.slice(batchStart, batchStart + BATCH_SIZE);

    // Split DB batch into API_BATCH-sized chunks
    const apiBatches: HadithRow[][] = [];
    for (let i = 0; i < dbBatch.length; i += API_BATCH) {
      apiBatches.push(dbBatch.slice(i, i + API_BATCH));
    }

    // Process API batches with concurrency limit
    const apiResults = await mapLimit(apiBatches, CONCURRENCY, (apiBatch) =>
      processApiBatch(apiBatch, LANG)
    );

    // Flatten results and update counters
    const batchResults: Array<{ hadithId: number; matnText: string } | null> = [];
    for (const r of apiResults) {
      batchResults.push(...r.results);
      for (const item of r.results) {
        if (item !== null) {
          done++;
          if (done % 100 === 0) {
            const currentCount = getTranslationCount(LANG);
            console.log(`  → ${done} done | DB: ${currentCount.toLocaleString()}`);
          }
        }
      }
      errors += r.errCount;
    }

    // Commit and log live DB count
    const commitBatch = db.transaction(() => {
      for (const r of batchResults) {
        if (r === null) continue;
        insertStmt.run({
          hadithId: r.hadithId,
          langCode: LANG,
          matnText: r.matnText,
          translator: TRANSLATOR,
        });
      }
    });
    commitBatch();
    const currentCount = getTranslationCount(LANG);
    process.stdout.write(
      `\r  [${done}/${total}] DB: ${currentCount.toLocaleString()} | ${errors} errors    `
    );
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n  ✓ Done in ${elapsed}s`);
  console.log(`    Translated: ${done}`);
  console.log(`    Errors:     ${errors}`);

  const afterCount = getTranslationCount(LANG);
  console.log(`  DB ${LANG.toUpperCase()} count after:  ${afterCount.toLocaleString()}`);
  console.log(`  Added: ${afterCount - beforeCount}`);

  db.close();
}

main().catch((err) => {
  console.error('\nFatal:', err);
  db.close();
  process.exit(1);
});
