/**
 * lib/hadith-db.ts
 *
 * Hadith search and retrieval functions.
 * Connects to the separate hujjah-hadith-core.db SQLite database.
 */

import { getDB } from './db';

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
  sanad_length: number;
  rank: number;
  snippet?: string;
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
  limit: number = 20
): Promise<HadithResult[]> {
  const db = await getHadithDB();
  if (!query.trim()) return [];

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
      h.sanad_length,
      bm25(hadith_search_idx) AS rank,
      snippet(hadith_search_idx, 0, '<mark>', '</mark>', '...', 32) AS snippet
    FROM hadith_search_idx
    JOIN hadiths h ON h.id = hadith_search_idx.rowid
    JOIN hadith_books b ON b.id = h.book_id
    WHERE hadith_search_idx MATCH ?
    ORDER BY
      bm25(hadith_search_idx) +
      CASE WHEN h.sanad_length <= 3 THEN -0.5
           WHEN h.sanad_length <= 6 THEN -0.2
           ELSE 0 END
    LIMIT ?
  `;

  const rows = await db.select<any[]>(sql, [cleanQuery, Math.min(limit, 50)]);

  return (rows ?? []).map((r) => ({
    id: r.id,
    book_id: r.book_id,
    book_name_ar: r.book_name_ar,
    book_name_en: r.book_name_en,
    num_in_book: r.num_in_book,
    hadith_ar: r.hadith_ar,
    matn_ar: r.matn_ar,
    sanad_length: r.sanad_length,
    rank: r.rank,
    snippet: r.snippet ?? r.matn_ar.slice(0, 160) + '...',
  }));
}

// ─── Exact Lookup ───

export async function getHadithByRef(
  bookId: number,
  numInBook: number
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
      h.sanad_length,
      0 AS rank
    FROM hadiths h
    JOIN hadith_books b ON b.id = h.book_id
    WHERE h.book_id = ? AND h.num_in_book = ?
    LIMIT 1
  `;
  const rows = await db.select<any[]>(sql, [bookId, numInBook]);
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
    sanad_length: r.sanad_length,
    rank: 0,
    snippet: r.matn_ar,
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
