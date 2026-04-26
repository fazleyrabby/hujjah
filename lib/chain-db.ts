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
  name_en?: string | null;
  name_bn?: string | null;
  birth_year?: number | null;
  death_year?: number | null;
  tabaqah?: number | null;
  reliability?: string | null;
  city?: string | null;
  data_source?: string | null;
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

// ─── Arabic Normalizer ───
function normalizeArabicQuery(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // harakat + tatweel
    .replace(/[أإآٱ]/g, 'ا')                       // alif variants → bare alif
    .replace(/ى/g, 'ي');                           // alif maqsura → ya
}

// ─── Search Narrators ───

export async function searchNarrators(query: string, limit: number = 20): Promise<NarratorNode[]> {
  const db = await getHadithDB();
  if (!query.trim()) return [];

  const cleanQuery = normalizeArabicQuery(query.trim());

  // Try FTS5 first (supports Arabic + transliterated name_en search)
  try {
    const ftsSql = `
      SELECT n.id, n.name_ar, n.name_en, n.name_bn, n.birth_year, n.death_year, n.tabaqah, n.reliability, n.city, n.data_source
      FROM narrator_search_idx
      JOIN narrators n ON n.id = narrator_search_idx.rowid
      WHERE narrator_search_idx MATCH ?
      LIMIT ?
    `;
    const rows = await db.select<NarratorNode[]>(ftsSql, [cleanQuery, limit]);
    if (rows.length > 0) return rows;
  } catch {
    // FTS5 not available or query syntax error — fall through to LIKE
  }

  // Fallback: LIKE search on name_ar
  const sql = `
    SELECT id, name_ar, name_en, name_bn, birth_year, death_year, tabaqah, reliability, city, data_source
    FROM narrators
    WHERE name_ar LIKE ?
    ORDER BY length(name_ar)
    LIMIT ?
  `;
  return db.select<NarratorNode[]>(sql, [`%${cleanQuery}%`, limit]);
}

// ─── Get Narrator Profile ───

export async function getNarratorById(id: number): Promise<NarratorNode | null> {
  const db = await getHadithDB();
  const rows = await db.select<NarratorNode[]>(
    'SELECT id, name_ar, name_en, name_bn, birth_year, death_year, tabaqah, reliability, city, data_source FROM narrators WHERE id = ?',
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
      n.name_en as from_name_en,
      n.name_bn as from_name_bn,
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
      nn.name_en as to_name_en,
      nn.name_bn as to_name_bn,
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
      h.matn_ar,
      h.hadith_ar,
      ht_en.matn_text as matn_en,
      ht_bn.matn_text as matn_bn
    FROM hadiths h
    JOIN hadith_books b ON b.id = h.book_id
    LEFT JOIN hadith_translations ht_en ON ht_en.hadith_id = h.id AND ht_en.lang_code = 'en'
    LEFT JOIN hadith_translations ht_bn ON ht_bn.hadith_id = h.id AND ht_bn.lang_code = 'bn'
    JOIN hadith_narrators hn1 ON hn1.hadith_id = h.id
    JOIN hadith_narrators hn2 ON hn2.hadith_id = h.id AND hn2.position = hn1.position + 1
    WHERE hn1.narrator_id = ? AND hn2.narrator_id = ?
    ORDER BY h.id
    LIMIT ?
  `;

  const rows = await db.select<any[]>(sql, [fromNarratorId, toNarratorId, limit]);

  // Fetch chain for each hadith
  const result: HadithChain[] = [];
  for (const r of rows) {
    const chainSql = `
      SELECT n.id, n.name_ar, n.name_en, n.name_bn, n.birth_year, n.death_year, n.tabaqah, n.reliability, n.city, n.data_source
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
      hadith_ar: r.hadith_ar,
      matn_en: r.matn_en || r.matn_bn, // Fallback
      chain,
    } as any);
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
    matn_en: string | null;
    matn_bn: string | null;
  };
  chain: NarratorNode[];
}> {
  const db = await getHadithDB();

  const hadithSql = `
    SELECT h.id, b.name_ar as book_name_ar, b.name_en as book_name_en,
      h.num_in_book, h.matn_ar, h.hadith_ar,
      ht_en.matn_text as matn_en,
      ht_bn.matn_text as matn_bn
    FROM hadiths h
    JOIN hadith_books b ON b.id = h.book_id
    LEFT JOIN hadith_translations ht_en ON ht_en.hadith_id = h.id AND ht_en.lang_code = 'en'
    LEFT JOIN hadith_translations ht_bn ON ht_bn.hadith_id = h.id AND ht_bn.lang_code = 'bn'
    WHERE h.id = ?
  `;
  const hadithRows = await db.select<any[]>(hadithSql, [hadithId]);

  const chainSql = `
    SELECT n.id, n.name_ar, n.name_en, n.name_bn, n.birth_year, n.death_year, n.tabaqah, n.reliability, n.city, n.data_source
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
      SELECT e.from_narrator_id, n.name_ar as from_name, n.name_en as from_name_en, n.name_bn as from_name_bn, n.tabaqah as from_tabaqah, n.reliability as from_reliability, n.city as from_city, n.data_source as from_data_source,
        e.to_narrator_id, nn.name_ar as to_name, nn.name_en as to_name_en, nn.name_bn as to_name_bn, nn.tabaqah as to_tabaqah, nn.reliability as to_reliability, nn.city as to_city, nn.data_source as to_data_source, e.hadith_count
      FROM narrator_edges e
      JOIN narrators n ON n.id = e.from_narrator_id
      JOIN narrators nn ON nn.id = e.to_narrator_id
      WHERE e.from_narrator_id IN (${placeholders})
      ORDER BY e.hadith_count DESC
      LIMIT 100
    `;
    const outEdges = await db.select<NarratorEdge[]>(outSql, currentIds);

    const nextIds: number[] = [];
    for (const e of outEdges) {
      const key = `${e.from_narrator_id}-${e.to_narrator_id}`;
      if (!edges.has(key)) {
        edges.set(key, e);
        if (!nodes.has(e.from_narrator_id)) {
          nodes.set(e.from_narrator_id, {
            id: e.from_narrator_id,
            name_ar: e.from_name,
            name_en: (e as any).from_name_en,
            name_bn: (e as any).from_name_bn,
            tabaqah: (e as any).from_tabaqah,
            reliability: (e as any).from_reliability,
            city: (e as any).from_city,
            data_source: (e as any).from_data_source,
          });
        }
        if (!nodes.has(e.to_narrator_id)) {
          nodes.set(e.to_narrator_id, {
            id: e.to_narrator_id,
            name_ar: e.to_name,
            name_en: (e as any).to_name_en,
            name_bn: (e as any).to_name_bn,
            tabaqah: (e as any).to_tabaqah,
            reliability: (e as any).to_reliability,
            city: (e as any).to_city,
            data_source: (e as any).to_data_source,
          });
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

// ─── Common Chain Detection ───

/**
 * Find narrators shared between two hadith chains.
 * Useful for detecting common transmission paths.
 */
export async function getCommonNarrators(
  hadithId1: number,
  hadithId2: number
): Promise<NarratorNode[]> {
  const db = await getHadithDB();
  const sql = `
    WITH chain1 AS (SELECT narrator_id FROM hadith_narrators WHERE hadith_id = ?),
         chain2 AS (SELECT narrator_id FROM hadith_narrators WHERE hadith_id = ?)
    SELECT n.id, n.name_ar, n.name_en, n.name_bn, n.birth_year, n.death_year, n.tabaqah, n.reliability, n.city, n.data_source
    FROM narrators n
    WHERE n.id IN (SELECT narrator_id FROM chain1 INTERSECT SELECT narrator_id FROM chain2)
  `;
  return db.select<NarratorNode[]>(sql, [hadithId1, hadithId2]);
}
