/**
 * lib/chain-db.ts
 *
 * Narrator chain (sanad) graph queries.
 * Uses the narrator_edges adjacency table for fast traversal.
 */

import { getHadithDB } from './hadith-db';

export interface NarratorNode {
  id: number;
  name_ar: string;
}

export interface NarratorEdge {
  from_narrator_id: number;
  from_name: string;
  to_narrator_id: number;
  to_name: string;
  hadith_count: number;
}

export interface HadithChain {
  hadith_id: number;
  book_name_ar: string;
  book_name_en: string | null;
  num_in_book: number;
  matn_ar: string;
  chain: NarratorNode[];
}

// ─── Search Narrators ───

export async function searchNarrators(query: string, limit: number = 20): Promise<NarratorNode[]> {
  const db = await getHadithDB();
  if (!query.trim()) return [];

  const sql = `
    SELECT id, name_ar
    FROM narrators
    WHERE name_ar LIKE ?
    ORDER BY length(name_ar)
    LIMIT ?
  `;
  return db.select<NarratorNode[]>(sql, [`%${query.trim()}%`, limit]);
}

// ─── Get Narrator Profile ───

export async function getNarratorById(id: number): Promise<NarratorNode | null> {
  const db = await getHadithDB();
  const rows = await db.select<NarratorNode[]>(
    'SELECT id, name_ar FROM narrators WHERE id = ?',
    [id]
  );
  return rows[0] ?? null;
}

// ─── Get Edges ───

export async function getNarratorEdges(narratorId: number): Promise<{
  teachers: NarratorEdge[];
  students: NarratorEdge[];
}> {
  const db = await getHadithDB();

  const teachersSql = `
    SELECT
      e.from_narrator_id,
      n.name_ar as from_name,
      e.to_narrator_id,
      nn.name_ar as to_name,
      e.hadith_count
    FROM narrator_edges e
    JOIN narrators n ON n.id = e.from_narrator_id
    JOIN narrators nn ON nn.id = e.to_narrator_id
    WHERE e.to_narrator_id = ?
    ORDER BY e.hadith_count DESC
  `;

  const studentsSql = `
    SELECT
      e.from_narrator_id,
      n.name_ar as from_name,
      e.to_narrator_id,
      nn.name_ar as to_name,
      e.hadith_count
    FROM narrator_edges e
    JOIN narrators n ON n.id = e.from_narrator_id
    JOIN narrators nn ON nn.id = e.to_narrator_id
    WHERE e.from_narrator_id = ?
    ORDER BY e.hadith_count DESC
  `;

  const [teachers, students] = await Promise.all([
    db.select<NarratorEdge[]>(teachersSql, [narratorId]),
    db.select<NarratorEdge[]>(studentsSql, [narratorId]),
  ]);

  return { teachers, students };
}

// ─── Get Hadiths for an Edge ───

export async function getHadithsForEdge(
  fromNarratorId: number,
  toNarratorId: number,
  limit: number = 20
): Promise<HadithChain[]> {
  const db = await getHadithDB();

  const sql = `
    SELECT
      h.id as hadith_id,
      b.name_ar as book_name_ar,
      b.name_en as book_name_en,
      h.num_in_book,
      h.matn_ar
    FROM hadiths h
    JOIN hadith_books b ON b.id = h.book_id
    JOIN hadith_narrators hn1 ON hn1.hadith_id = h.id
    JOIN hadith_narrators hn2 ON hn2.hadith_id = h.id AND hn2.position = hn1.position + 1
    WHERE hn1.narrator_id = ? AND hn2.narrator_id = ?
    ORDER BY h.id
    LIMIT ?
  `;

  const rows = await db.select<
    {
      hadith_id: number;
      book_name_ar: string;
      book_name_en: string | null;
      num_in_book: number;
      matn_ar: string;
    }[]
  >(sql, [fromNarratorId, toNarratorId, limit]);

  // Fetch chain for each hadith
  const result: HadithChain[] = [];
  for (const r of rows) {
    const chainSql = `
      SELECT n.id, n.name_ar
      FROM hadith_narrators hn
      JOIN narrators n ON n.id = hn.narrator_id
      WHERE hn.hadith_id = ?
      ORDER BY hn.position
    `;
    const chain = await db.select<NarratorNode[]>(chainSql, [r.hadith_id]);
    result.push({
      hadith_id: r.hadith_id,
      book_name_ar: r.book_name_ar,
      book_name_en: r.book_name_en,
      num_in_book: r.num_in_book,
      matn_ar: r.matn_ar,
      chain,
    });
  }

  return result;
}

// ─── Get Full Chain for a Hadith ───

export async function getHadithChain(hadithId: number): Promise<{
  hadith: {
    id: number;
    book_name_ar: string;
    book_name_en: string | null;
    num_in_book: number;
    matn_ar: string;
    hadith_ar: string;
  };
  chain: NarratorNode[];
}> {
  const db = await getHadithDB();

  const hadithSql = `
    SELECT h.id, b.name_ar as book_name_ar, b.name_en as book_name_en,
      h.num_in_book, h.matn_ar, h.hadith_ar
    FROM hadiths h
    JOIN hadith_books b ON b.id = h.book_id
    WHERE h.id = ?
  `;
  const hadithRows = await db.select<
    {
      id: number;
      book_name_ar: string;
      book_name_en: string | null;
      num_in_book: number;
      matn_ar: string;
      hadith_ar: string;
    }[]
  >(hadithSql, [hadithId]);

  const chainSql = `
    SELECT n.id, n.name_ar
    FROM hadith_narrators hn
    JOIN narrators n ON n.id = hn.narrator_id
    WHERE hn.hadith_id = ?
    ORDER BY hn.position
  `;
  const chain = await db.select<NarratorNode[]>(chainSql, [hadithId]);

  return {
    hadith: hadithRows[0],
    chain,
  };
}

// ─── Depth-Limited BFS from a Narrator ───

export async function getNarratorGraph(
  startNarratorId: number,
  maxDepth: number = 2
): Promise<{
  nodes: NarratorNode[];
  edges: NarratorEdge[];
}> {
  const db = await getHadithDB();
  const nodes = new Map<number, NarratorNode>();
  const edges = new Map<string, NarratorEdge>();

  async function bfsDepth(currentIds: number[], depth: number) {
    if (depth > maxDepth || currentIds.length === 0) return;

    const placeholders = currentIds.map(() => '?').join(',');

    // Outgoing edges
    const outSql = `
      SELECT e.from_narrator_id, n.name_ar as from_name,
        e.to_narrator_id, nn.name_ar as to_name, e.hadith_count
      FROM narrator_edges e
      JOIN narrators n ON n.id = e.from_narrator_id
      JOIN narrators nn ON nn.id = e.to_narrator_id
      WHERE e.from_narrator_id IN (${placeholders})
    `;
    const outEdges = await db.select<NarratorEdge[]>(outSql, currentIds);

    const nextIds: number[] = [];
    for (const e of outEdges) {
      const key = `${e.from_narrator_id}-${e.to_narrator_id}`;
      if (!edges.has(key)) {
        edges.set(key, e);
        if (!nodes.has(e.from_narrator_id)) {
          nodes.set(e.from_narrator_id, { id: e.from_narrator_id, name_ar: e.from_name });
        }
        if (!nodes.has(e.to_narrator_id)) {
          nodes.set(e.to_narrator_id, { id: e.to_narrator_id, name_ar: e.to_name });
          nextIds.push(e.to_narrator_id);
        }
      }
    }

    await bfsDepth(nextIds, depth + 1);
  }

  // Seed start node
  const start = await getNarratorById(startNarratorId);
  if (start) {
    nodes.set(start.id, start);
    await bfsDepth([start.id], 1);
  }

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
  };
}
