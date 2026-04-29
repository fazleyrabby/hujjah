/**
 * lib/hadith-db.ts
 *
 * Hadith search and retrieval functions.
 * Connects to the separate hujjah-hadith-core.db SQLite database.
 */

import { getDB } from './db';
import { classifyQuery } from './search-utils';
import { IS_MOCK_MODE, mockGetRandomHadiths, mockSearchHadith, mockGetHadithBooks, mockGetHadithStats } from './mocks';

// ─── Types ───

export interface HadithBook {
  id: number;
  name_ar: string;
  name_en: string | null;
  hadith_count: number;
}

export interface HadithResult {
  id: number;
  book_id: number;
  book_name_ar: string;
  book_name_en: string | null;
  num_in_book: number;
  hadith_ar: string;
  matn_ar: string;
  matn_en: string | null;
  sanad_length: number;
  rank: number;
  snippet?: string;
  translations?: {
    sunnah?: string | null;    // sunnah.com EN translation
    hadith_api?: string | null; // fawazahmed0/hadith-api BN translation
    qwen?: string | null;      // AI translation (legacy sanadset hadiths)
  };
}

// ─── DB Connection ───

interface DBLike {
  select: <T>(sql: string, bindValues?: unknown[]) => Promise<T>;
  execute: (sql: string, bindValues?: unknown[]) => Promise<{ rowsAffected: number; lastInsertId: number }>;
}

let hadithDbPromise: Promise<DBLike> | null = null;

export async function getHadithDB(): Promise<DBLike> {
  if (hadithDbPromise) return hadithDbPromise;

  hadithDbPromise = (async () => {
    try {
      const mod = await import('@tauri-apps/plugin-sql');
      const Database = mod.default;
      const db = await Database.load('sqlite:hujjah-hadith-core.db');
      return db as DBLike;
    } catch (err) {
      console.warn('[HadithDB] Tauri SQL plugin unavailable — using mock DB', err);
      return {
        select: async <T>() => [] as unknown as T,
        execute: async () => ({ rowsAffected: 0, lastInsertId: 0 }),
      };
    }
  })();

  return hadithDbPromise;
}

// ─── Book List ───

export async function getHadithBooks(): Promise<HadithBook[]> {
  if (IS_MOCK_MODE) return mockGetHadithBooks();
  const db = await getHadithDB();
  const sql = `
    SELECT id, name_ar, name_en, hadith_count
    FROM hadith_books
    WHERE hadith_count > 0
    ORDER BY hadith_count DESC
  `;
  return db.select<HadithBook[]>(sql);
}

// ─── Hadith Query Router ───

export async function processHadithQuery(
  query: string,
  limit: number = 20,
  lang: string = 'en'
): Promise<HadithResult[]> {
  if (IS_MOCK_MODE) return mockSearchHadith(query, limit, lang);
  const classification = classifyQuery(query);

  if (classification.type === 'command' && classification.command === 'hadith' && classification.subQuery) {
    return searchHadithKeyword(classification.subQuery, limit, lang);
  }

  return searchHadithKeyword(classification.raw, limit, lang);
}

// ─── Arabic Normalizer ───
// FTS5 unicode61 strips diacritics during indexing but not from queries.
// We normalize the query to match the stripped index form.
function normalizeArabicQuery(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // harakat + tatweel
    .replace(/[أإآٱ]/g, 'ا')                       // alif variants → bare alif
    .replace(/ى/g, 'ي');                           // alif maqsura → ya
}

// ─── Keyword Search (FTS5) ───

export async function searchHadithKeyword(
  query: string,
  limit: number = 20,
  lang: string = 'en'
): Promise<HadithResult[]> {
  if (IS_MOCK_MODE) return mockSearchHadith(query, limit, lang);
  return _searchHadith(query, limit, lang, undefined);
}

/**
 * AI Chatbot Hadith search — ONLY sunnah.com translations.
 * Excludes AI translations to ensure consistent, verified source.
 */
export async function searchHadithForAI(
  query: string,
  limit: number = 3,
  lang: string = 'en'
): Promise<HadithResult[]> {
  return _searchHadith(query, limit, lang, 'sunnah.com');
}

async function _searchHadith(
  query: string,
  limit: number,
  lang: string,
  translatorFilter?: string
): Promise<HadithResult[]> {
  const db = await getHadithDB();
  if (!query.trim()) return [];

  const isArabic = /[\u0600-\u06FF]/.test(query);
  const useTranslatedFTS = !isArabic && ['en', 'bn'].includes(lang);
  const cap = Math.min(limit, 50);

  let rows: any[] = [];

  if (useTranslatedFTS) {
    try {
      let ftsSql = `
        SELECT
          h.id,
          h.book_id,
          b.name_ar AS book_name_ar,
          b.name_en AS book_name_en,
          h.num_in_book,
          h.hadith_ar,
          h.matn_ar,
          ht.matn_text AS matn_en,
          h.sanad_length,
          bm25(hadith_trans_search_idx) AS rank,
          snippet(hadith_trans_search_idx, 0, '<mark>', '</mark>', '...', 32) AS snippet
        FROM hadith_trans_search_idx
        JOIN hadith_translations ht ON ht.id = hadith_trans_search_idx.rowid
        JOIN hadiths h ON h.id = ht.hadith_id
        JOIN hadith_books b ON b.id = h.book_id
        WHERE hadith_trans_search_idx MATCH ? AND ht.lang_code = ?
      `;

      if (translatorFilter) {
        ftsSql += ` AND ht.translator = '${translatorFilter}'`;
      }

      ftsSql += `
        ORDER BY
          bm25(hadith_trans_search_idx) +
          CASE WHEN h.sanad_length <= 3 THEN -0.5
               WHEN h.sanad_length <= 6 THEN -0.2
               ELSE 0 END
        LIMIT ?
      `;

      rows = await db.select<any[]>(ftsSql, [query.trim(), lang, cap]);
    } catch {
      rows = [];
    }
  }

  // Fall back to Arabic FTS (always works, translations may be incomplete)
  if (rows.length === 0) {
    const cleanQuery = normalizeArabicQuery(query.trim());
    if (!cleanQuery) return [];

    let sql = `
      SELECT
        h.id,
        h.book_id,
        b.name_ar AS book_name_ar,
        b.name_en AS book_name_en,
        h.num_in_book,
        h.hadith_ar,
        h.matn_ar,
        ht_sunnah.matn_text AS sunnah_translation,
        ht_hadith_api.matn_text AS hadith_api_translation,
        h.sanad_length,
        bm25(hadith_search_idx) AS rank,
        snippet(hadith_search_idx, 0, '<mark>', '</mark>', '...', 32) AS snippet
      FROM hadith_search_idx
      JOIN hadiths h ON h.id = hadith_search_idx.rowid
      JOIN hadith_books b ON b.id = h.book_id
      LEFT JOIN hadith_translations ht_sunnah ON ht_sunnah.hadith_id = h.id AND ht_sunnah.lang_code = 'en' AND ht_sunnah.translator = 'sunnah.com'
      LEFT JOIN hadith_translations ht_hadith_api ON ht_hadith_api.hadith_id = h.id AND ht_hadith_api.lang_code = 'bn' AND ht_hadith_api.translator = 'hadith-api'
      WHERE hadith_search_idx MATCH ?
    `;

    sql += `
      ORDER BY
        bm25(hadith_search_idx) +
        CASE WHEN h.sanad_length <= 3 THEN -0.5
             WHEN h.sanad_length <= 6 THEN -0.2
             ELSE 0 END
      LIMIT ?
    `;

    rows = await db.select<any[]>(sql, [cleanQuery, cap]);
  }

  // Deduplicate by hadith ID — same hadith can match multiple translator rows
  const seen = new Set<number>();
  const deduped = (rows ?? []).filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  return deduped.map((r) => ({
    id: r.id,
    book_id: r.book_id,
    book_name_ar: r.book_name_ar,
    book_name_en: r.book_name_en,
    num_in_book: r.num_in_book,
    hadith_ar: r.hadith_ar,
    matn_ar: r.matn_ar,
    matn_en: r.sunnah_translation ?? r.hadith_api_translation ?? r.matn_en ?? null,
    sanad_length: r.sanad_length,
    rank: r.rank,
    snippet: r.snippet ?? r.matn_ar.slice(0, 160) + '...',
    translations: {
      sunnah: r.sunnah_translation ?? null,
      hadith_api: r.hadith_api_translation ?? null,
      qwen: null,
    },
  }));
}

// ─── Exact Lookup ───

export async function getHadithByRef(
  bookId: number,
  numInBook: number,
  lang: string = 'en'
): Promise<HadithResult | null> {
  const db = await getHadithDB();
  const sql = `
    SELECT
      h.id,
      h.book_id,
      b.name_ar AS book_name_ar,
      b.name_en AS book_name_en,
      h.num_in_book,
      h.hadith_ar,
      h.matn_ar,
      ht_sunnah.matn_text AS sunnah_translation,
      ht_hadith_api.matn_text AS hadith_api_translation,
      h.sanad_length,
      0 AS rank
    FROM hadiths h
    JOIN hadith_books b ON b.id = h.book_id
    LEFT JOIN hadith_translations ht_sunnah ON ht_sunnah.hadith_id = h.id AND ht_sunnah.lang_code = 'en' AND ht_sunnah.translator = 'sunnah.com'
    LEFT JOIN hadith_translations ht_hadith_api ON ht_hadith_api.hadith_id = h.id AND ht_hadith_api.lang_code = 'bn' AND ht_hadith_api.translator = 'hadith-api'
    WHERE h.book_id = ? AND h.num_in_book = ?
    LIMIT 1
  `;
  const rows = await db.select<any[]>(sql, [bookId, numInBook]);
  if (rows.length === 0) return null;
  const r = rows[0];
  const matn_en = lang === 'bn'
    ? (r.hadith_api_translation ?? r.sunnah_translation ?? null)
    : (r.sunnah_translation ?? null);
  return {
    id: r.id,
    book_id: r.book_id,
    book_name_ar: r.book_name_ar,
    book_name_en: r.book_name_en,
    num_in_book: r.num_in_book,
    hadith_ar: r.hadith_ar,
    matn_ar: r.matn_ar,
    matn_en,
    sanad_length: r.sanad_length,
    rank: 0,
    snippet: r.matn_ar,
    translations: {
      sunnah: r.sunnah_translation ?? null,
      hadith_api: r.hadith_api_translation ?? null,
    },
  };
}

// ─── Paginated Hadith Listing ───

export interface HadithPageResult {
  hadiths: HadithResult[];
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
}

export async function getHadithsByBook(
  bookId: number,
  page: number = 1,
  perPage: number = 20,
  lang: string = 'en'
): Promise<HadithPageResult> {
  const db = await getHadithDB();
  const offset = (page - 1) * perPage;

  const countSql = `SELECT COUNT(*) as total FROM hadiths WHERE book_id = ?`;
  const countRows = await db.select<{ total: number }[]>(countSql, [bookId]);
  const total = countRows[0]?.total ?? 0;

  const sql = `
    SELECT
      h.id,
      h.book_id,
      b.name_ar AS book_name_ar,
      b.name_en AS book_name_en,
      h.num_in_book,
      h.hadith_ar,
      h.matn_ar,
      ht_sunnah.matn_text AS sunnah_translation,
      ht_hadith_api.matn_text AS hadith_api_translation,
      h.sanad_length,
      0 AS rank
    FROM hadiths h
    JOIN hadith_books b ON b.id = h.book_id
    LEFT JOIN hadith_translations ht_sunnah ON ht_sunnah.hadith_id = h.id AND ht_sunnah.lang_code = 'en' AND ht_sunnah.translator = 'sunnah.com'
    LEFT JOIN hadith_translations ht_hadith_api ON ht_hadith_api.hadith_id = h.id AND ht_hadith_api.lang_code = 'bn' AND ht_hadith_api.translator = 'hadith-api'
    WHERE h.book_id = ?
    ORDER BY h.num_in_book ASC
    LIMIT ? OFFSET ?
  `;
  const rows = await db.select<any[]>(sql, [bookId, perPage, offset]);

  return {
    hadiths: rows.map((r) => ({
      id: r.id,
      book_id: r.book_id,
      book_name_ar: r.book_name_ar,
      book_name_en: r.book_name_en,
      num_in_book: r.num_in_book,
      hadith_ar: r.hadith_ar,
      matn_ar: r.matn_ar,
      matn_en: lang === 'bn'
        ? (r.hadith_api_translation ?? r.sunnah_translation ?? null)
        : (r.sunnah_translation ?? null),
      sanad_length: r.sanad_length,
      rank: r.rank,
      snippet: r.matn_ar,
      translations: {
        sunnah: r.sunnah_translation ?? null,
        hadith_api: r.hadith_api_translation ?? null,
      },
    })),
    total,
    totalPages: Math.ceil(total / perPage),
    page,
    perPage,
  };
}

// ─── Random Hadiths (Vault-style listing) ───

export async function getRandomHadiths(
  limit: number = 15,
  lang: string = 'en'
): Promise<HadithResult[]> {
  if (IS_MOCK_MODE) return mockGetRandomHadiths(limit, lang);
  const db = await getHadithDB();
  const cap = Math.min(limit, 50);

  const sql = `
    SELECT
      h.id,
      h.book_id,
      b.name_ar AS book_name_ar,
      b.name_en AS book_name_en,
      h.num_in_book,
      h.hadith_ar,
      h.matn_ar,
      ht_sunnah.matn_text AS sunnah_translation,
      ht_hadith_api.matn_text AS hadith_api_translation,
      h.sanad_length,
      0 AS rank
    FROM hadiths h
    JOIN hadith_books b ON b.id = h.book_id
    LEFT JOIN hadith_translations ht_sunnah ON ht_sunnah.hadith_id = h.id AND ht_sunnah.lang_code = 'en' AND ht_sunnah.translator = 'sunnah.com'
    LEFT JOIN hadith_translations ht_hadith_api ON ht_hadith_api.hadith_id = h.id AND ht_hadith_api.lang_code = 'bn' AND ht_hadith_api.translator = 'hadith-api'
    WHERE h.id IN (
      SELECT id FROM hadiths ORDER BY RANDOM() LIMIT ?
    )
    ORDER BY h.id
  `;

  const rows = await db.select<any[]>(sql, [cap]);

  return (rows ?? []).map((r) => ({
    id: r.id,
    book_id: r.book_id,
    book_name_ar: r.book_name_ar,
    book_name_en: r.book_name_en,
    num_in_book: r.num_in_book,
    hadith_ar: r.hadith_ar,
    matn_ar: r.matn_ar,
    matn_en: lang === 'bn'
      ? (r.hadith_api_translation ?? r.sunnah_translation ?? null)
      : (r.sunnah_translation ?? null),
    sanad_length: r.sanad_length,
    rank: 0,
    snippet: r.matn_ar,
    translations: {
      sunnah: r.sunnah_translation ?? null,
      hadith_api: r.hadith_api_translation ?? null,
    },
  }));
}

// ─── Stats ───

export async function getHadithStats(): Promise<{
  hadith: number;
  books: number;
  narrators: number;
}> {
  if (IS_MOCK_MODE) return mockGetHadithStats();
  const db = await getHadithDB();
  const sql = `
    SELECT
      (SELECT count(*) FROM hadiths) AS hadith,
      (SELECT count(*) FROM hadith_books WHERE hadith_count > 0) AS books,
      (SELECT count(*) FROM narrators) AS narrators
  `;
  const rows = await db.select<{ hadith: number; books: number; narrators: number }[]>(sql);
  return rows[0] ?? { hadith: 0, books: 0, narrators: 0 };
}
