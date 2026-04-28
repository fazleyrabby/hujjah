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
  from_name_en?: string | null;
  from_name_bn?: string | null;
  to_narrator_id: number;
  to_name: string;
  to_name_en?: string | null;
  to_name_bn?: string | null;
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
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىو]/g, 'و');
}

function normalizeArabicForLike(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىو]/g, 'و');
}

function isSameNarratorName(
  a: { name_en?: string | null; name_ar?: string | null },
  b: { name_en?: string | null; name_ar?: string | null }
): boolean {
  if (a.name_en && b.name_en && a.name_en.toLowerCase().trim() === b.name_en.toLowerCase().trim()) return true;
  const an = normalizeArabicQuery(a.name_ar || '');
  const bn = normalizeArabicQuery(b.name_ar || '');
  return an.length >= 3 && an === bn;
}

function isChronologicallyImpossible(
  student: { id: number; death_year?: number | null; name_en?: string | null; name_ar?: string | null },
  teacher: { id: number; death_year?: number | null; name_en?: string | null; name_ar?: string | null }
): boolean {
  if (student.id === teacher.id) return true;
  if (isSameNarratorName(student, teacher)) return true;

  const sd = student.death_year;
  const td = teacher.death_year;
  if (sd == null || td == null) return false;

  if (td > sd + 40) return true;
  if (sd < td - 40) return true;

  return false;
}

// ─── Search Narrators ───

/**
 * Deduplicate narrator results. The DB stores the same narrator multiple times
 * with different Arabic spelling/diacritics. Group by (name_en, death_year);
 * if both are absent fall back to normalized Arabic name.
 */
function deduplicateNarrators(rows: NarratorNode[]): NarratorNode[] {
  const seen = new Set<string>();
  const out: NarratorNode[] = [];
  for (const r of rows) {
    const enKey = r.name_en?.trim().toLowerCase();
    const key = enKey
      ? `en:${enKey}:${r.death_year ?? '?'}`
      : `ar:${normalizeArabicQuery(r.name_ar)}:${r.death_year ?? '?'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export async function searchNarrators(query: string, limit: number = 20): Promise<NarratorNode[]> {
  const db = await getHadithDB();
  if (!query.trim()) return [];

  const isArabic = /[\u0600-\u06FF]/.test(query);
  const normalizedQuery = isArabic ? normalizeArabicQuery(query.trim()) : query.trim();

  // Try FTS5 first (supports Arabic + transliterated name_en search)
  try {
    const ftsQuery = normalizedQuery.split(/\s+/).filter(Boolean).map(w => `${w}*`).join(' ');

    const ftsSql = `
      SELECT n.id, n.name_ar, n.name_en, n.name_bn, n.birth_year, n.death_year, n.tabaqah, n.reliability, n.city, n.data_source,
             COUNT(hn.hadith_id) as hadith_count
      FROM narrator_search_idx
      JOIN narrators n ON n.id = narrator_search_idx.rowid
      LEFT JOIN hadith_narrators hn ON hn.narrator_id = n.id
      WHERE narrator_search_idx MATCH ?
      GROUP BY n.id
      ORDER BY hadith_count DESC
      LIMIT ?
    `;
    const rows = await db.select<NarratorNode[]>(ftsSql, [ftsQuery, limit * 5]);
    if (rows.length > 0) return deduplicateNarrators(rows).slice(0, limit);
  } catch (err) {
    console.warn('[ChainDB] FTS5 search failed, falling back to LIKE:', err);
  }

  // LIKE fallback with normalized Arabic (handles و/ى ambiguity)
  if (isArabic) {
    const normalSql = `
      SELECT n.id, n.name_ar, n.name_en, n.name_bn, n.birth_year, n.death_year, n.tabaqah, n.reliability, n.city, n.data_source,
             COUNT(hn.hadith_id) as hadith_count
      FROM narrators n
      LEFT JOIN hadith_narrators hn ON hn.narrator_id = n.id
      WHERE REPLACE(REPLACE(REPLACE(REPLACE(name_ar, CHAR(1571), 'ا'), CHAR(1573), 'ا'), CHAR(1570), 'ا'), CHAR(1575), 'ا') LIKE ?
         OR REPLACE(REPLACE(REPLACE(REPLACE(name_ar, CHAR(1571), 'ا'), CHAR(1573), 'ا'), CHAR(1570), 'ا'), CHAR(1575), 'ا') LIKE ?
         OR name_en LIKE ?
      GROUP BY n.id
      ORDER BY hadith_count DESC
      LIMIT ?
    `;
    const lQuery1 = `%${normalizedQuery}%`;
    const lQuery2 = `%${normalizedQuery.replace(/و/g, '%')}%`;
    const enQuery = `%${query.trim()}%`;
    const rows = await db.select<NarratorNode[]>(normalSql, [lQuery1, lQuery2, enQuery, limit * 5]);
    return deduplicateNarrators(rows).slice(0, limit);
  }

  // English search fallback
  const sql = `
    SELECT n.id, n.name_ar, n.name_en, n.name_bn, n.birth_year, n.death_year, n.tabaqah, n.reliability, n.city, n.data_source,
           COUNT(hn.hadith_id) as hadith_count
    FROM narrators n
    LEFT JOIN hadith_narrators hn ON hn.narrator_id = n.id
    WHERE name_en LIKE ? OR name_ar LIKE ? OR name_bn LIKE ?
    GROUP BY n.id
    ORDER BY
      CASE
        WHEN name_en LIKE ? THEN 1
        WHEN name_ar LIKE ? THEN 2
        ELSE 3
      END,
      hadith_count DESC
    LIMIT ?
  `;
  const lQuery = `%${normalizedQuery}%`;
  const rows = await db.select<NarratorNode[]>(sql, [lQuery, lQuery, lQuery, lQuery, lQuery, limit * 5]);
  return deduplicateNarrators(rows).slice(0, limit);
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

  // Get center node death_year for filtering
  const centerRows = await db.select<{ death_year: number }[]>(
    'SELECT death_year FROM narrators WHERE id = ?', [narratorId]
  );
  const centerDeathYear = centerRows[0]?.death_year;

  // Edge semantics: from_narrator_id = student (lower position, closer to collector)
  //                 to_narrator_id   = teacher (higher position, closer to Prophet)
  //
  // Teachers of selected = edges where selected is the student (from) and to is the teacher
  const teachersSql = `
    SELECT
      e.from_narrator_id,
      n.name_ar as from_name,
      n.name_en as from_name_en,
      n.name_bn as from_name_bn,
      n.death_year as from_death_year,
      e.to_narrator_id,
      nn.name_ar as to_name,
      nn.name_en as to_name_en,
      nn.name_bn as to_name_bn,
      nn.death_year as to_death_year,
      e.hadith_count
    FROM narrator_edges e
    JOIN narrators n ON n.id = e.from_narrator_id
    JOIN narrators nn ON nn.id = e.to_narrator_id
    WHERE e.from_narrator_id = ?
    ORDER BY e.hadith_count DESC
  `;

  // Students of selected = edges where selected is the teacher (to) and from is the student
  const studentsSql = `
    SELECT
      e.from_narrator_id,
      n.name_ar as from_name,
      n.name_en as from_name_en,
      n.name_bn as from_name_bn,
      n.death_year as from_death_year,
      e.to_narrator_id,
      nn.name_ar as to_name,
      nn.name_en as to_name_en,
      nn.name_bn as to_name_bn,
      nn.death_year as to_death_year,
      e.hadith_count
    FROM narrator_edges e
    JOIN narrators n ON n.id = e.from_narrator_id
    JOIN narrators nn ON nn.id = e.to_narrator_id
    WHERE e.to_narrator_id = ?
    ORDER BY e.hadith_count DESC
  `;

  const [teachers, students] = await Promise.all([
    db.select<any[]>(teachersSql, [narratorId]),
    db.select<any[]>(studentsSql, [narratorId]),
  ]);

  const filterFn = (edge: any, isTeacher: boolean) => {
    const student = { id: edge.from_narrator_id, name_en: edge.from_name_en, name_ar: edge.from_name, death_year: edge.from_death_year };
    const teacher = { id: edge.to_narrator_id, name_en: edge.to_name_en, name_ar: edge.to_name, death_year: edge.to_death_year };
    return !isChronologicallyImpossible(student, teacher);
  };

  const filteredTeachers = teachers.filter(t => filterFn(t, true));
  const filteredStudents = students.filter(s => filterFn(s, false));

  return { teachers: filteredTeachers, students: filteredStudents };
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

    // Outgoing edges: current → student
    const outSql = `
      SELECT e.from_narrator_id, n.name_ar as from_name, n.name_en as from_name_en, n.name_bn as from_name_bn, n.tabaqah as from_tabaqah, n.reliability as from_reliability, n.city as from_city, n.data_source as from_data_source, n.death_year as from_death_year,
        e.to_narrator_id, nn.name_ar as to_name, nn.name_en as to_name_en, nn.name_bn as to_name_bn, nn.tabaqah as to_tabaqah, nn.reliability as to_reliability, nn.city as to_city, nn.data_source as to_data_source, nn.death_year as to_death_year, e.hadith_count
      FROM narrator_edges e
      JOIN narrators n ON n.id = e.from_narrator_id
      JOIN narrators nn ON nn.id = e.to_narrator_id
      WHERE e.from_narrator_id IN (${placeholders})
      ORDER BY e.hadith_count DESC
      LIMIT 100
    `;
    const outEdges = await db.select<NarratorEdge[]>(outSql, currentIds);

    // Incoming edges: teacher → current
    const inSql = `
      SELECT e.from_narrator_id, n.name_ar as from_name, n.name_en as from_name_en, n.name_bn as from_name_bn, n.tabaqah as from_tabaqah, n.reliability as from_reliability, n.city as from_city, n.data_source as from_data_source, n.death_year as from_death_year,
        e.to_narrator_id, nn.name_ar as to_name, nn.name_en as to_name_en, nn.name_bn as to_name_bn, nn.tabaqah as to_tabaqah, nn.reliability as to_reliability, nn.city as to_city, nn.data_source as to_data_source, nn.death_year as to_death_year, e.hadith_count
      FROM narrator_edges e
      JOIN narrators n ON n.id = e.from_narrator_id
      JOIN narrators nn ON nn.id = e.to_narrator_id
      WHERE e.to_narrator_id IN (${placeholders})
      ORDER BY e.hadith_count DESC
      LIMIT 100
    `;
    const inEdges = await db.select<NarratorEdge[]>(inSql, currentIds);

    const nextIds: number[] = [];
    for (const e of [...outEdges, ...inEdges]) {
      // Apply chronological filter (same as web API)
      const student = { id: e.from_narrator_id, name_en: (e as any).from_name_en, name_ar: e.from_name, death_year: (e as any).from_death_year };
      const teacher = { id: e.to_narrator_id, name_en: (e as any).to_name_en, name_ar: e.to_name, death_year: (e as any).to_death_year };
      if (isChronologicallyImpossible(student, teacher)) continue;

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
          nextIds.push(e.from_narrator_id);
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
