/**
 * Unified Search Router for Hujjah Quran Vault
 *
 * Features:
 * - Surah metadata navigation
 * - Multilingual FTS5 search (EN/BN) with snippets
 * - Regex-based query dispatcher (Reference, Surah, Command, Keyword)
 * - Semantic fallback via vector embeddings + RRF merging
 */

import { classifyQuery } from './search-utils';

// ─── Types ───
export interface QuranFTSResult {
  surah: number;
  ayah: number;
  text_ar: string;
  text: string;
  translator_slug: string;
  rank: number;
  snippet?: string;
}

export interface Surah {
  id: number;
  name_ar: string;
  name_en: string;
  name_bn: string;
}

export interface SurahVerse {
  id: number;
  surah: number;
  ayah: number;
  text_ar: string;
  text: string;
  translator_slug: string;
}

export interface SearchResult {
  type: 'ref' | 'surah' | 'verse' | 'command';
  surah: number;
  surah_name: string;
  ayah: number;
  text_ar: string;
  text: string;
  translator_slug: string;
  snippet?: string;
  rank: number;
  label: string;
}

export interface QuranStats {
  verses: number;
  translations: number;
  languages: number;
}

interface QueryResult {
  rowsAffected: number;
  lastInsertId: number;
}

interface DBLike {
  select: <T>(sql: string, bindValues?: unknown[]) => Promise<T>;
  execute: (sql: string, bindValues?: unknown[]) => Promise<QueryResult>;
}

// ─── Singleton ───
let dbPromise: Promise<DBLike> | null = null;

export async function getDB(): Promise<DBLike> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    try {
      const mod = await import('@tauri-apps/plugin-sql');
      const Database = mod.default;
      const db = await Database.load('sqlite:hujjah-quran.db');
      return db as DBLike;
    } catch (err) {
      console.warn('[DB] Tauri SQL plugin unavailable — using mock DB', err);
      return createMockDB();
    }
  })();

  return dbPromise;
}

function createMockDB(): DBLike {
  return {
    select: async <T>() => [] as unknown as T,
    execute: async () => ({ rowsAffected: 0, lastInsertId: 0 }),
  };
}

// ─── Surah Navigation ───
export async function getSurahList(): Promise<Surah[]> {
  const db = await getDB();
  const sql = 'SELECT id, name_ar, name_en, name_bn FROM surahs ORDER BY id';
  return db.select<Surah[]>(sql);
}

export async function getSurahById(id: number): Promise<Surah | null> {
  const db = await getDB();
  const sql = 'SELECT id, name_ar, name_en, name_bn FROM surahs WHERE id = ?';
  const rows = await db.select<Surah[]>(sql, [id]);
  return rows[0] || null;
}

export async function getSurahTranslators(surah: number, lang: string = 'en'): Promise<{ translator_slug: string; count: number }[]> {
  const db = await getDB();
  const sql = `
    SELECT t.translator_slug, COUNT(*) as count
    FROM translations t
    JOIN verses v ON v.id = t.verse_id
    WHERE v.surah = ? AND t.lang_code = ?
    GROUP BY t.translator_slug
    ORDER BY t.translator_slug
  `;
  return db.select<{ translator_slug: string; count: number }[]>(sql, [surah, lang]);
}

export async function getSurahVerses(
  surah: number,
  lang: string = 'en',
  translatorSlug?: string
): Promise<SurahVerse[]> {
  const db = await getDB();

  if (translatorSlug) {
    const sql = `
      SELECT v.id, v.surah, v.ayah, v.text_ar, t.text, t.translator_slug
      FROM verses v
      JOIN translations t ON v.id = t.verse_id
      WHERE v.surah = ? AND t.lang_code = ? AND t.translator_slug = ?
      ORDER BY v.ayah
    `;
    return db.select<SurahVerse[]>(sql, [surah, lang, translatorSlug]);
  }

  // Default: pick one translation per verse deterministically
  const sql = `
    SELECT v.id, v.surah, v.ayah, v.text_ar, t.text, t.translator_slug
    FROM verses v
    JOIN translations t ON v.id = t.verse_id
    WHERE v.surah = ? AND t.lang_code = ?
      AND t.rowid = (
        SELECT rowid FROM translations
        WHERE verse_id = v.id AND lang_code = ?
        ORDER BY CASE translator_slug
          WHEN 'sahih' THEN 1
          WHEN 'bengali' THEN 1
          WHEN 'pickthall' THEN 2
          WHEN 'yusufali' THEN 3
          WHEN 'arberry' THEN 4
          WHEN 'shakir' THEN 5
          WHEN 'hilali' THEN 6
          WHEN 'itani' THEN 7
          WHEN 'maududi' THEN 8
          WHEN 'sarwar' THEN 9
          WHEN 'hoque' THEN 2
          ELSE 10
        END, translator_slug
        LIMIT 1
      )
    ORDER BY v.ayah
  `;
  return db.select<SurahVerse[]>(sql, [surah, lang, lang]);
}

// ─── Query Dispatcher ───
export async function processQuery(
  query: string,
  lang: string = 'en',
  limit: number = 20
): Promise<SearchResult[]> {
  const classification = classifyQuery(query);

  switch (classification.type) {
    case 'reference':
      if (classification.surah && classification.ayah) {
        return searchReference(classification.surah, classification.ayah, lang);
      }
      return [];

    case 'command':
      if (classification.command === 'quran' && classification.subQuery) {
        return searchKeyword(classification.subQuery, lang, limit);
      }
      return [];

    case 'surah': {
      const surahMatch = await matchSurahName(classification.raw, lang);
      if (surahMatch) {
        return [
          {
            type: 'surah',
            surah: surahMatch.id,
            surah_name: lang === 'bn' ? surahMatch.name_bn : surahMatch.name_en,
            ayah: 1,
            text_ar: '',
            text: `${surahMatch.name_en} (${surahMatch.name_ar})`,
            translator_slug: '',
            rank: 0,
            label: 'SURAH',
            snippet: `Jump to Surah ${surahMatch.id}`,
          },
        ];
      }
      // Fall through to keyword search if surah name doesn't match
      break;
    }

    case 'keyword':
    default:
      break;
  }

  // KEYWORD LANE: FTS5 search
  const keywordResults = await searchKeyword(classification.raw, lang, limit);

  // SEMANTIC FALLBACK: if keyword results < 3
  if (keywordResults.length < 3) {
    const semanticResults = await searchSemantic(classification.raw, lang, limit);
    return rrfMerge(keywordResults, semanticResults, limit);
  }

  return keywordResults;
}

async function searchReference(surah: number, ayah: number, lang: string): Promise<SearchResult[]> {
  const db = await getDB();
  const sql = `
    SELECT v.surah, v.ayah, v.text_ar, t.text, t.translator_slug,
      s.name_en, s.name_bn
    FROM verses v
    JOIN translations t ON v.id = t.verse_id
    JOIN surahs s ON s.id = v.surah
    WHERE v.surah = ? AND v.ayah = ? AND t.lang_code = ?
    LIMIT 1
  `;
  const rows = await db.select<any[]>(sql, [surah, ayah, lang]);
  return rows.map((r) => ({
    type: 'ref' as const,
    surah: r.surah,
    surah_name: lang === 'bn' ? r.name_bn : r.name_en,
    ayah: r.ayah,
    text_ar: r.text_ar,
    text: r.text,
    translator_slug: r.translator_slug,
    rank: 0,
    label: 'REF',
    snippet: `${r.surah}:${r.ayah}`,
  }));
}

async function matchSurahName(query: string, lang: string): Promise<Surah | null> {
  const db = await getDB();
  const sql = `
    SELECT id, name_ar, name_en, name_bn FROM surahs
    WHERE LOWER(name_en) = LOWER(?) OR LOWER(name_bn) = LOWER(?)
    LIMIT 1
  `;
  const rows = await db.select<Surah[]>(sql, [query, query]);
  if (rows.length > 0) return rows[0];

  // Try partial match
  const sql2 = `
    SELECT id, name_ar, name_en, name_bn FROM surahs
    WHERE LOWER(name_en) LIKE LOWER(?) OR LOWER(name_bn) LIKE LOWER(?)
    LIMIT 1
  `;
  const rows2 = await db.select<Surah[]>(sql2, [`%${query}%`, `%${query}%`]);
  return rows2[0] ?? null;
}

// ─── Keyword Search (FTS5) ───
async function searchKeyword(query: string, lang: string, limit: number): Promise<SearchResult[]> {
  const db = await getDB();

  // Use snippet for highlighting
  const sql = `
    SELECT
      v.surah,
      v.ayah,
      v.text_ar,
      t.text,
      t.translator_slug,
      s.name_en,
      s.name_bn,
      bm25(quran_search_idx) AS rank,
      snippet(quran_search_idx, 1, '<mark>', '</mark>', '...', 32) AS snippet
    FROM quran_search_idx
    JOIN translations t ON t.id = quran_search_idx.rowid
    JOIN verses v ON v.id = t.verse_id
    JOIN surahs s ON s.id = v.surah
    WHERE quran_search_idx MATCH ? AND quran_search_idx.lang_code = ?
    ORDER BY bm25(quran_search_idx)
    LIMIT ?
  `;

  const rows = await db.select<any[]>(sql, [query.trim(), lang, Math.min(limit, 20)]);

  return (rows ?? []).map((r) => ({
    type: 'verse' as const,
    surah: r.surah,
    surah_name: lang === 'bn' ? r.name_bn : r.name_en,
    ayah: r.ayah,
    text_ar: r.text_ar,
    text: r.text,
    translator_slug: r.translator_slug,
    rank: r.rank,
    label: 'VERSE',
    snippet: r.snippet ?? r.text.slice(0, 120) + '...',
  }));
}

// ─── Semantic Search (Vector Fallback) ───
async function searchSemantic(query: string, lang: string, limit: number): Promise<SearchResult[]> {
  try {
    const { retrieveHybrid } = await import('./ai/retrieve');
    const results = await retrieveHybrid(query, lang, limit);
    
    return results.map(r => ({
      type: 'verse' as const,
      surah: r.surah,
      surah_name: lang === 'bn' ? r.surah_name_bn : r.surah_name_en,
      ayah: r.ayah,
      text_ar: r.text_ar,
      text: r.text,
      translator_slug: r.translator_slug,
      rank: r.similarity,
      label: 'SEMANTIC',
      snippet: r.text.slice(0, 160) + '...'
    }));
  } catch (err) {
    console.error('[Search] Semantic fallback failed:', err);
    return [];
  }
}

// ─── Reciprocal Rank Fusion ───
function rrfMerge(
  keywordResults: SearchResult[],
  semanticResults: SearchResult[],
  limit: number,
  k: number = 60
): SearchResult[] {
  const scores = new Map<string, number>();
  const items = new Map<string, SearchResult>();

  keywordResults.forEach((r, i) => {
    const key = `${r.surah}:${r.ayah}`;
    scores.set(key, (scores.get(key) ?? 0) + 1 / (k + i + 1));
    items.set(key, r);
  });

  semanticResults.forEach((r, i) => {
    const key = `${r.surah}:${r.ayah}`;
    scores.set(key, (scores.get(key) ?? 0) + 1 / (k + i + 1));
    const existing = items.get(key);
    if (!existing) items.set(key, r);
  });

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => items.get(key)!);
}

// ─── Stats ───
export async function getQuranStats(): Promise<QuranStats> {
  const db = await getDB();
  const sql = `
    SELECT
      (SELECT count(*) FROM verses) AS verses,
      (SELECT count(*) FROM translations) AS translations,
      (SELECT count(DISTINCT lang_code) FROM translations) AS languages
  `;
  const rows = await db.select<QuranStats[]>(sql);
  return rows[0] ?? { verses: 0, translations: 0, languages: 0 };
}

// ─── Legacy Purge ───
export async function purgeLegacyStorage(): Promise<string> {
  const legacyDbNames = ['hujjah-minimal', 'hujjah-vault'];
  for (const name of legacyDbNames) {
    try {
      await window.indexedDB.deleteDatabase(name);
      console.log(`[Purge] Deleted IndexedDB: ${name}`);
    } catch {
      // ignore
    }
  }

  localStorage.clear();
  console.log('[Purge] Cleared localStorage');

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<string>('purge_legacy_storage');
    return result;
  } catch {
    return 'Mock: legacy purged';
  }
}

// ─── Backwards compat: old searchQuranFTS ───
export async function searchQuranFTS(
  query: string,
  lang: string = 'en',
  limit: number = 20
): Promise<QuranFTSResult[]> {
  if (!query.trim()) return [];
  const db = await getDB();
  const sql = `
    SELECT
      v.surah,
      v.ayah,
      v.text_ar,
      t.text,
      t.translator_slug,
      bm25(quran_search_idx) AS rank
    FROM quran_search_idx
    JOIN translations t ON t.id = quran_search_idx.rowid
    JOIN verses v ON v.id = t.verse_id
    WHERE quran_search_idx MATCH ? AND quran_search_idx.lang_code = ?
    ORDER BY bm25(quran_search_idx)
    LIMIT ?
  `;
  const results = await db.select<QuranFTSResult[]>(sql, [
    query.trim(),
    lang,
    Math.min(limit, 20),
  ]);
  return results ?? [];
}
