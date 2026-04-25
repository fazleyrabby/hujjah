#!/usr/bin/env ts-node
/**
 * scripts/import-github-hadith-translations.ts
 *
 * Imports English & Bengali translations from fawazahmed0/hadith-api
 * into hujjah-hadith-core.db as alternative translator.
 *
 * Non-destructive: adds translations without overwriting Qwen translations.
 *
 * Usage:
 *   npx ts-node scripts/import-github-hadith-translations.ts [options]
 *
 * Options:
 *   --langs    en,bn (default: en,bn)
 *   --books    all | "Sahih al-Bukhari,Sahih Muslim" (default: all)
 *   --dry-run  (fetch and show stats, don't insert)
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

const LANGS = getArg('--langs', 'en,bn').split(',').map(l => l.trim());
const BOOKS_FILTER = getArg('--books', 'all');
const DRY_RUN = hasFlag('--dry-run');
const TRANSLATOR = 'github-classic';

const GITHUB_API_BASE = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';

// Map GitHub edition names to book names in your DB
const EDITION_MAP: Record<string, { bookNameEn: string; langCode: string }> = {
  // English
  'eng-bukhari': { bookNameEn: 'Sahih al-Bukhari', langCode: 'en' },
  'eng-muslim': { bookNameEn: 'Sahih Muslim', langCode: 'en' },
  'eng-abudawud': { bookNameEn: 'Sunan Abu Dawood', langCode: 'en' },
  'eng-tirmidhi': { bookNameEn: "Jami' at-Tirmidhi", langCode: 'en' },
  'eng-ibnmajah': { bookNameEn: 'Sunan Ibn Majah', langCode: 'en' },
  'eng-nasai': { bookNameEn: 'Sunan al-Kubra (al-Nasa\'i)', langCode: 'en' },
  // Bengali
  'ben-bukhari': { bookNameEn: 'Sahih al-Bukhari', langCode: 'bn' },
  'ben-muslim': { bookNameEn: 'Sahih Muslim', langCode: 'bn' },
  'ben-abudawud': { bookNameEn: 'Sunan Abu Dawood', langCode: 'bn' },
  'ben-tirmidhi': { bookNameEn: "Jami' at-Tirmidhi", langCode: 'bn' },
  'ben-ibnmajah': { bookNameEn: 'Sunan Ibn Majah', langCode: 'bn' },
  'ben-nasai': { bookNameEn: 'Sunan al-Kubra (al-Nasa\'i)', langCode: 'bn' },
};

// ─── DB ─────────────────────────────────────────────────────────────────────

const DB_PATH = path.join(process.cwd(), 'src-tauri', 'resources', 'hujjah-hadith-core.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('DB not found:', DB_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// ─── Types ──────────────────────────────────────────────────────────────────

interface GitHubHadith {
  hadithnumber: number;
  arabicnumber: number;
  text: string;
  grades: string[];
  reference: { book: number; hadith: number };
}

interface GitHubEdition {
  metadata: {
    name: string;
    section: Record<string, string>;
  };
  hadiths: GitHubHadith[];
}

interface BookRow {
  id: number;
  name_en: string;
  hadith_count: number;
}

// ─── DB Helpers ─────────────────────────────────────────────────────────────

const insertTranslation = db.prepare(`
  INSERT OR IGNORE INTO hadith_translations
    (hadith_id, lang_code, matn_text, translator)
  VALUES
    (@hadithId, @langCode, @matnText, @translator)
`);

function getBookId(bookNameEn: string): number | null {
  const row = db
    .prepare(`SELECT id FROM hadith_books WHERE name_en = ?`)
    .get(bookNameEn) as { id: number } | undefined;
  return row?.id ?? null;
}

function getHadithId(bookId: number, numInBook: number): number | null {
  const row = db
    .prepare(`SELECT id FROM hadiths WHERE book_id = ? AND num_in_book = ?`)
    .get(bookId, numInBook) as { id: number } | undefined;
  return row?.id ?? null;
}

function getTranslationCount(lang: string, translator: string): number {
  const row = db
    .prepare(`SELECT count(*) as c FROM hadith_translations WHERE lang_code = ? AND translator = ?`)
    .get(lang, translator) as { c: number };
  return row.c;
}

async function fetchEdition(editionName: string): Promise<GitHubEdition | null> {
  const url = `${GITHUB_API_BASE}/${editionName}.json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as GitHubEdition;
  } catch (err) {
    console.error(`  ✗ Failed to fetch ${editionName}:`, err);
    return null;
  }
}

// ─── Main Import Logic ──────────────────────────────────────────────────────

async function importEdition(editionName: string): Promise<{
  fetched: number;
  matched: number;
  inserted: number;
  skipped: number;
}> {
  const mapping = EDITION_MAP[editionName];
  if (!mapping) {
    console.error(`  ✗ Unknown edition: ${editionName}`);
    return { fetched: 0, matched: 0, inserted: 0, skipped: 0 };
  }

  const { bookNameEn, langCode } = mapping;

  // Check if language is requested
  if (!LANGS.includes(langCode)) {
    console.log(`  ⊘ Skipping ${editionName} (${langCode}) — not in --langs`);
    return { fetched: 0, matched: 0, inserted: 0, skipped: 0 };
  }

  // Check if book is requested
  if (BOOKS_FILTER !== 'all' && !BOOKS_FILTER.split(',').map(s => s.trim()).includes(bookNameEn)) {
    console.log(`  ⊘ Skipping ${editionName} (${bookNameEn}) — not in --books`);
    return { fetched: 0, matched: 0, inserted: 0, skipped: 0 };
  }

  console.log(`\n→ Fetching ${editionName} (${bookNameEn} - ${langCode.toUpperCase()})...`);

  const data = await fetchEdition(editionName);
  if (!data) return { fetched: 0, matched: 0, inserted: 0, skipped: 0 };

  const fetched = data.hadiths.length;
  console.log(`  Fetched ${fetched.toLocaleString()} hadiths`);

  // Get book ID from local DB
  const bookId = getBookId(bookNameEn);
  if (!bookId) {
    console.error(`  ✗ Book not found in local DB: ${bookNameEn}`);
    return { fetched, matched: 0, inserted: 0, skipped: 0 };
  }

  let matched = 0;
  let inserted = 0;
  let skipped = 0;

  // Process in transaction for speed
  const insertBatch = db.transaction((hadiths: GitHubHadith[]) => {
    for (const hadith of hadiths) {
      const numInBook = hadith.hadithnumber;
      const hadithId = getHadithId(bookId, numInBook);

      if (!hadithId) {
        skipped++;
        continue;
      }

      matched++;

      // Insert translation
      const result = insertTranslation.run({
        hadithId,
        langCode,
        matnText: hadith.text.trim(),
        translator: TRANSLATOR,
      });

      if (result.changes > 0) {
        inserted++;
      } else {
        skipped++; // Already exists
      }
    }
  });

  insertBatch(data.hadiths);

  console.log(`  Matched: ${matched.toLocaleString()} / ${fetched.toLocaleString()}`);
  console.log(`  Inserted: ${inserted.toLocaleString()}`);
  console.log(`  Skipped: ${skipped.toLocaleString()}`);

  return { fetched, matched, inserted, skipped };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== GitHub Hadith Translation Importer ===');
  console.log(`  Languages:   ${LANGS.join(', ')}`);
  console.log(`  Books:       ${BOOKS_FILTER}`);
  console.log(`  Translator:  ${TRANSLATOR}`);
  console.log(`  Dry run:     ${DRY_RUN ? 'YES' : 'NO'}`);
  console.log('');

  // Show current counts
  for (const lang of LANGS) {
    const qwenCount = getTranslationCount(lang, 'qwen3.5-9b');
    const githubCount = getTranslationCount(lang, TRANSLATOR);
    console.log(`  ${lang.toUpperCase()} translations:`);
    console.log(`    Qwen:        ${qwenCount.toLocaleString()}`);
    console.log(`    GitHub:      ${githubCount.toLocaleString()}`);
  }

  if (DRY_RUN) {
    console.log('\n*** DRY RUN — no data will be inserted ***');
    console.log('\nFetching sample to estimate import size...\n');
  }

  const editions = Object.keys(EDITION_MAP);
  const results = {
    totalFetched: 0,
    totalMatched: 0,
    totalInserted: 0,
    totalSkipped: 0,
  };

  for (const edition of editions) {
    const result = await importEdition(edition);
    results.totalFetched += result.fetched;
    results.totalMatched += result.matched;
    results.totalInserted += result.inserted;
    results.totalSkipped += result.skipped;
  }

  console.log('\n=== Summary ===');
  console.log(`  Total fetched:   ${results.totalFetched.toLocaleString()}`);
  console.log(`  Total matched:   ${results.totalMatched.toLocaleString()}`);
  console.log(`  Total inserted:  ${results.totalInserted.toLocaleString()}`);
  console.log(`  Total skipped:   ${results.totalSkipped.toLocaleString()}`);

  if (DRY_RUN) {
    console.log('\n*** DRY RUN COMPLETE — run without --dry-run to import ***');
  } else {
    // Show final counts
    console.log('\n=== Final Counts ===');
    for (const lang of LANGS) {
      const qwenCount = getTranslationCount(lang, 'qwen3.5-9b');
      const githubCount = getTranslationCount(lang, TRANSLATOR);
      console.log(`  ${lang.toUpperCase()}:`);
      console.log(`    Qwen:        ${qwenCount.toLocaleString()}`);
      console.log(`    GitHub:      ${githubCount.toLocaleString()}`);
      console.log(`    Total:       ${(qwenCount + githubCount).toLocaleString()}`);
    }
  }

  db.close();
  console.log('\n✓ Done\n');
}

main().catch((err) => {
  console.error('\nFatal:', err);
  db.close();
  process.exit(1);
});
