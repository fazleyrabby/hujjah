/**
 * lib/hadith-db.ts
 *
 * Hadith search and retrieval functions.
 * Connects to the separate hujjah-hadith-core.db SQLite database.
 */

import { getDB } from './db';
import { classifyQuery } from './search-utils';

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
  matn_en: string | null;  // AI translation (null if not yet translated)
  sanad_length: number;
  rank: number;
  snippet?: string;
  // Multiple translations
  translations?: {
    qwen?: string | null;      // AI translation
    github?: string | null;    // Classic translation from GitHub API
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
  const db = await getHadithDB();
  if (!query.trim()) return [];

  // For English/Bengali queries: try translated FTS first, fall back to Arabic
  const isArabic = /[\u0600-\u06FF]/.test(query);
  const useTranslatedFTS = !isArabic && ['en', 'bn'].includes(lang);

  let rows: any[] = [];

  if (useTranslatedFTS) {
    try {
      const ftsSql = `
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
        ORDER BY
          bm25(hadith_trans_search_idx) +
          CASE WHEN h.sanad_length <= 3 THEN -0.5
               WHEN h.sanad_length <= 6 THEN -0.2
               ELSE 0 END
        LIMIT ?
      `;
      rows = await db.select<any[]>(ftsSql, [query.trim(), lang, Math.min(limit, 50)]);
    } catch {
      rows = [];
    }
  }

  // Fall back to Arabic FTS (always works, translations may be incomplete)
  if (rows.length === 0) {
    const cleanQuery = normalizeArabicQuery(query.trim());
    if (!cleanQuery) return [];

    const sql = `
      SELECT
        h.id,
        h.book_id,
        b.name_ar AS book_name_ar,
        b.name_en AS book_name_en,
        h.num_in_book,
        h.hadith_ar,
        h.matn_ar,
        ht_qwen.matn_text AS matn_en,
        ht_github.matn_text AS github_translation,
        h.sanad_length,
        bm25(hadith_search_idx) AS rank,
        snippet(hadith_search_idx, 0, '<mark>', '</mark>', '...', 32) AS snippet
      FROM hadith_search_idx
      JOIN hadiths h ON h.id = hadith_search_idx.rowid
      JOIN hadith_books b ON b.id = h.book_id
      LEFT JOIN hadith_translations ht_qwen ON ht_qwen.hadith_id = h.id AND ht_qwen.lang_code = ? AND ht_qwen.translator = 'qwen3.5-9b'
      LEFT JOIN hadith_translations ht_github ON ht_github.hadith_id = h.id AND ht_github.lang_code = ? AND ht_github.translator = 'github-classic'
      WHERE hadith_search_idx MATCH ?
      ORDER BY
        bm25(hadith_search_idx) +
        CASE WHEN h.sanad_length <= 3 THEN -0.5
             WHEN h.sanad_length <= 6 THEN -0.2
             ELSE 0 END
      LIMIT ?
    `;
    rows = await db.select<any[]>(sql, [lang, lang, cleanQuery, Math.min(limit, 50)]);
  }

  return (rows ?? []).map((r) => ({
    id: r.id,
    book_id: r.book_id,
    book_name_ar: r.book_name_ar,
    book_name_en: r.book_name_en,
    num_in_book: r.num_in_book,
    hadith_ar: r.hadith_ar,
    matn_ar: r.matn_ar,
    matn_en: r.github_translation ?? r.matn_en ?? null,
    sanad_length: r.sanad_length,
    rank: r.rank,
    snippet: r.snippet ?? r.matn_ar.slice(0, 160) + '...',
    translations: {
      qwen: r.matn_en ?? null,
      github: r.github_translation ?? null,
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
      ht_qwen.matn_text AS matn_en,
      ht_github.matn_text AS github_translation,
      h.sanad_length,
      0 AS rank
    FROM hadiths h
    JOIN hadith_books b ON b.id = h.book_id
    LEFT JOIN hadith_translations ht_qwen ON ht_qwen.hadith_id = h.id AND ht_qwen.lang_code = ? AND ht_qwen.translator = 'qwen3.5-9b'
    LEFT JOIN hadith_translations ht_github ON ht_github.hadith_id = h.id AND ht_github.lang_code = ? AND ht_github.translator = 'github-classic'
    WHERE h.book_id = ? AND h.num_in_book = ?
    LIMIT 1
  `;
  const rows = await db.select<any[]>(sql, [lang, lang, bookId, numInBook]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    book_id: r.book_id,
    book_name_ar: r.book_name_ar,
    book_name_en: r.book_name_en,
    num_in_book: r.num_in_book,
    hadith_ar: r.hadith_ar,
    matn_ar: r.matn_ar,
    matn_en: r.matn_en ?? r.github_translation ?? null,
    sanad_length: r.sanad_length,
    rank: 0,
    snippet: r.matn_ar,
    translations: {
      qwen: r.matn_en ?? null,
      github: r.github_translation ?? null,
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
      ht_qwen.matn_text AS matn_en,
      ht_github.matn_text AS github_translation,
      h.sanad_length,
      0 AS rank
    FROM hadiths h
    JOIN hadith_books b ON b.id = h.book_id
    LEFT JOIN hadith_translations ht_qwen ON ht_qwen.hadith_id = h.id AND ht_qwen.lang_code = ? AND ht_qwen.translator = 'qwen3.5-9b'
    LEFT JOIN hadith_translations ht_github ON ht_github.hadith_id = h.id AND ht_github.lang_code = ? AND ht_github.translator = 'github-classic'
    WHERE h.book_id = ?
    ORDER BY h.num_in_book ASC
    LIMIT ? OFFSET ?
  `;
  const rows = await db.select<any[]>(sql, [lang, lang, bookId, perPage, offset]);

  return {
    hadiths: rows.map((r) => ({
      id: r.id,
      book_id: r.book_id,
      book_name_ar: r.book_name_ar,
      book_name_en: r.book_name_en,
      num_in_book: r.num_in_book,
      hadith_ar: r.hadith_ar,
      matn_ar: r.matn_ar,
      matn_en: r.matn_en ?? r.github_translation ?? null,
      sanad_length: r.sanad_length,
      rank: r.rank,
      snippet: r.matn_ar,
      translations: {
        qwen: r.matn_en ?? null,
        github: r.github_translation ?? null,
      },
    })),
    total,
    totalPages: Math.ceil(total / perPage),
    page,
    perPage,
  };
}

// ─── Stats ───

export async function getHadithStats(): Promise<{
  hadith: number;
  books: number;
  narrators: number;
}> {
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
