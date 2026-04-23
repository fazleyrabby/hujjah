/**
 * TASK 2: Hybrid Search Client for Tauri
 * 
 * Uses Tauri's invoke API to call the Rust backend which runs SQLite with FTS5.
 * Falls back to mock implementation when Tauri is not available (web dev mode).
 */

// Try to import Tauri APIs, fallback to mock for web dev
let invokeFn: (cmd: string, args?: Record<string, unknown>) => Promise<any>;

try {
  const tauri = require('@tauri-apps/api/core');
  invokeFn = tauri.invoke;
} catch {
  // Mock for web dev / non-Tauri environments
  invokeFn = async (cmd: string, args?: Record<string, unknown>) => {
    console.warn(`[Mock Tauri] ${cmd}`, args);
    if (cmd === 'get_db_path') return '/mock/hujjah.db';
    if (cmd === 'purge_legacy_storage') return 'Mock: legacy purged';
    if (cmd === 'sql_query') {
      // Return empty results for web dev
      return [];
    }
    return null;
  };
}

// ─── Types ───
export interface SearchResult {
  id: number;
  text: string;
  ref: string;
  type: 'quran' | 'hadith' | 'books';
  score: number;
  rank: number;
}

export interface HybridSearchOptions {
  query: string;
  queryEmbedding: number[];
  limit?: number;
}

// ─── TASK 0: Purge Legacy Storage ───
export async function purgeLegacyStorage(): Promise<string> {
  // Clear browser IndexedDB (old PGlite)
  const dbs = ['hujjah-minimal', 'hujjah-vault'];
  for (const dbName of dbs) {
    try {
      await window.indexedDB.deleteDatabase(dbName);
      console.log(`Deleted IndexedDB: ${dbName}`);
    } catch {
      // ignore
    }
  }

  // Clear localStorage
  localStorage.clear();
  console.log('Cleared localStorage');

  // Call Rust to purge disk-based legacy storage
  return await invokeFn('purge_legacy_storage');
}

// ─── Raw SQL Query (via Tauri Rust backend) ───
export async function sqlQuery(
  query: string,
  params: (string | number)[] = []
): Promise<Record<string, string>[]> {
  return await invokeFn('sql_query', { query, params });
}

// ─── Get DB Path ───
export async function getDbPath(): Promise<string> {
  return await invokeFn('get_db_path');
}

// ─── FTS5 Keyword Search ───
export async function searchFTS(
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  const rows = await sqlQuery(
    `
    SELECT 
      c.id,
      c.text,
      c.ref,
      c.type,
      bm25(fts_idx) as score
    FROM fts_idx
    JOIN content_store c ON c.id = fts_idx.rowid
    WHERE fts_idx MATCH ?
    ORDER BY bm25(fts_idx)
    LIMIT ?
    `,
    [query, limit]
  );

  return rows.map((row, index) => ({
    id: parseInt(row.id),
    text: row.text,
    ref: row.ref,
    type: row.type as 'quran' | 'hadith' | 'books',
    score: parseFloat(row.score || '0'),
    rank: index + 1,
  }));
}

// ─── Vector Similarity Search (Client-side cosine similarity) ───
export async function searchVector(
  queryEmbedding: number[],
  limit: number = 10
): Promise<SearchResult[]> {
  // NOTE: For production, replace with sqlite-vec KNN query:
  // SELECT * FROM vec_idx WHERE embedding MATCH ? ORDER BY distance LIMIT ?
  // This requires loading the sqlite-vec extension in Rust.

  // Fallback: fetch all embeddings and compute cosine similarity in JS
  const rows = await sqlQuery(
    `SELECT id, text, ref, type, embedding FROM content_store WHERE embedding IS NOT NULL LIMIT 1000`
  );

  const results = rows
    .map(row => {
      const emb = JSON.parse(row.embedding || '[]') as number[];
      if (emb.length === 0) return null;
      const similarity = cosineSimilarity(queryEmbedding, emb);
      return {
        id: parseInt(row.id),
        text: row.text,
        ref: row.ref,
        type: row.type as 'quran' | 'hadith' | 'books',
        score: similarity,
        rank: 0,
      };
    })
    .filter((r): r is SearchResult => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return results.map((r, i) => ({ ...r, rank: i + 1 }));
}

// ─── TASK 2: Hybrid Search with RRF ───
export async function hybridSearch(
  options: HybridSearchOptions
): Promise<SearchResult[]> {
  const { query, queryEmbedding, limit = 5 } = options;

  // 1. FTS5 keyword search
  const ftsResults = await searchFTS(query, limit * 2);

  // 2. Vector semantic search
  const vecResults = await searchVector(queryEmbedding, limit * 2);

  // 3. Reciprocal Rank Fusion (RRF)
  const k = 60;
  const scores = new Map<number, { result: SearchResult; rrf: number }>();

  for (const r of ftsResults) {
    const existing = scores.get(r.id);
    if (existing) {
      existing.rrf += 1 / (k + r.rank);
    } else {
      scores.set(r.id, { result: r, rrf: 1 / (k + r.rank) });
    }
  }

  for (const r of vecResults) {
    const existing = scores.get(r.id);
    if (existing) {
      existing.rrf += 1 / (k + r.rank);
    } else {
      scores.set(r.id, { result: r, rrf: 1 / (k + r.rank) });
    }
  }

  const merged = Array.from(scores.values())
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, limit)
    .map((item, index) => ({
      ...item.result,
      score: item.rrf,
      rank: index + 1,
    }));

  return merged;
}

// ─── Utility: Cosine Similarity ───
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Stats ───
export async function getStats(): Promise<{
  total: number;
  quran: number;
  hadith: number;
  books: number;
}> {
  const [total, quran, hadith, books] = await Promise.all([
    sqlQuery('SELECT count(*) as c FROM content_store').then(r => parseInt(r[0]?.c || '0')),
    sqlQuery("SELECT count(*) as c FROM content_store WHERE type = 'quran'").then(r => parseInt(r[0]?.c || '0')),
    sqlQuery("SELECT count(*) as c FROM content_store WHERE type = 'hadith'").then(r => parseInt(r[0]?.c || '0')),
    sqlQuery("SELECT count(*) as c FROM content_store WHERE type = 'books'").then(r => parseInt(r[0]?.c || '0')),
  ]);

  return { total, quran, hadith, books };
}
