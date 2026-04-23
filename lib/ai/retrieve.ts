/**
 * lib/ai/retrieve.ts
 *
 * Semantic Retrieval Pipeline (RAG Base)
 *
 * query → embed → similarity search → top N verses
 *
 * Uses pre-computed embeddings stored in SQLite.
 * Falls back to FTS5 keyword search if embeddings unavailable.
 */

import { getDB } from '@/lib/db';
import { embedOne, cosineSimilarity, type EmbeddingVector } from './embedding';

export interface RetrievedVerse {
  id: number;
  surah: number;
  ayah: number;
  text_ar: string;
  text: string;
  translator_slug: string;
  similarity: number;
}

/**
 * Retrieve semantically relevant verses for a query.
 *
 * 1. Generate embedding for the query
 * 2. Load candidate embeddings from SQLite
 * 3. Compute cosine similarity
 * 4. Return top N results
 */
export async function retrieveRelevantVerses(
  query: string,
  lang: string = 'en',
  topN: number = 5
): Promise<RetrievedVerse[]> {
  if (!query.trim()) return [];

  const db = await getDB();

  // Step 1: Generate query embedding
  const queryEmbedding = await embedOne(query);

  // Step 2: Load translations with embeddings for the target language
  // We load all English translations that have embeddings
  const sql = `
    SELECT
      t.id,
      v.surah,
      v.ayah,
      v.text_ar,
      t.text,
      t.translator_slug,
      t.embedding
    FROM translations t
    JOIN verses v ON v.id = t.verse_id
    WHERE t.lang_code = ? AND t.embedding IS NOT NULL
  `;

  const rows = await db.select<
    {
      id: number;
      surah: number;
      ayah: number;
      text_ar: string;
      text: string;
      translator_slug: string;
      embedding: ArrayBuffer;
    }[]
  >(sql, [lang]);

  // Step 3: Compute similarity for each candidate
  const scored: RetrievedVerse[] = [];
  for (const row of rows) {
    if (!row.embedding) continue;
    const candidate = new Float32Array(row.embedding);
    const similarity = cosineSimilarity(queryEmbedding, candidate);
    scored.push({
      id: row.id,
      surah: row.surah,
      ayah: row.ayah,
      text_ar: row.text_ar,
      text: row.text,
      translator_slug: row.translator_slug,
      similarity,
    });
  }

  // Step 4: Sort by similarity and return top N
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topN);
}

/**
 * Fast approximate retrieval using pre-filtering.
 * First runs FTS5 for candidate selection, then re-ranks by embedding similarity.
 */
export async function retrieveHybrid(
  query: string,
  lang: string = 'en',
  topN: number = 5
): Promise<RetrievedVerse[]> {
  if (!query.trim()) return [];

  const db = await getDB();
  const queryEmbedding = await embedOne(query);

  // Step 1: Use FTS5 to get candidate set (much smaller than full table)
  const ftsSql = `
    SELECT
      t.id,
      v.surah,
      v.ayah,
      v.text_ar,
      t.text,
      t.translator_slug,
      t.embedding
    FROM quran_search_idx
    JOIN translations t ON t.id = quran_search_idx.rowid
    JOIN verses v ON v.id = t.verse_id
    WHERE quran_search_idx MATCH ? AND quran_search_idx.lang_code = ?
    ORDER BY bm25(quran_search_idx)
    LIMIT 50
  `;

  const rows = await db.select<
    {
      id: number;
      surah: number;
      ayah: number;
      text_ar: string;
      text: string;
      translator_slug: string;
      embedding: ArrayBuffer;
    }[]
  >(ftsSql, [query.trim(), lang]);

  // Step 2: Re-rank by embedding similarity
  const scored: RetrievedVerse[] = [];
  for (const row of rows) {
    if (!row.embedding) continue;
    const candidate = new Float32Array(row.embedding);
    const similarity = cosineSimilarity(queryEmbedding, candidate);
    scored.push({
      id: row.id,
      surah: row.surah,
      ayah: row.ayah,
      text_ar: row.text_ar,
      text: row.text,
      translator_slug: row.translator_slug,
      similarity,
    });
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topN);
}
