import { NextRequest, NextResponse } from 'next/server';
import { getWebHadithDB } from '@/lib/web-db';

export const dynamic = 'force-dynamic';

function normalizeArabicQuery(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىو]/g, 'و');
}

function deduplicateNarrators(rows: any[]): any[] {
  const seen = new Set<string>();
  return rows.filter(r => {
    const enKey = r.name_en?.trim().toLowerCase();
    const key = enKey
      ? `en:${enKey}:${r.death_year ?? '?'}`
      : `ar:${normalizeArabicQuery(r.name_ar)}:${r.death_year ?? '?'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get('action');

  try {
    const db = getWebHadithDB();

    if (action === 'search') {
      const query = searchParams.get('q') ?? '';
      const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);
      if (!query.trim()) return NextResponse.json([]);

      const isArabic = /[\u0600-\u06FF]/.test(query);
      const cleanQuery = isArabic ? normalizeArabicQuery(query.trim()) : query.trim();

      try {
        const ftsQuery = cleanQuery.split(/\s+/).filter(Boolean).map(w => `${w}*`).join(' ');
        const rows = await db.select<any[]>(
          `SELECT n.id, n.name_ar, n.name_en, n.name_bn, n.birth_year, n.death_year,
                  n.tabaqah, n.reliability, n.city, n.data_source
           FROM narrator_search_idx
           JOIN narrators n ON n.id = narrator_search_idx.rowid
           WHERE narrator_search_idx MATCH ? LIMIT ?`,
          [ftsQuery, limit * 5]
        );
        if (rows.length > 0) {
          return NextResponse.json(deduplicateNarrators(rows).slice(0, limit));
        }
      } catch { /* fall through to LIKE */ }

      const lQuery = `%${cleanQuery}%`;
      const rows = await db.select<any[]>(
        `SELECT id, name_ar, name_en, name_bn, birth_year, death_year, tabaqah, reliability, city, data_source
         FROM narrators
         WHERE name_ar LIKE ? OR name_en LIKE ? OR name_bn LIKE ?
         ORDER BY CASE WHEN name_ar LIKE ? THEN 1 WHEN name_en LIKE ? THEN 2 ELSE 3 END, length(name_ar)
         LIMIT ?`,
        [lQuery, lQuery, lQuery, lQuery, lQuery, limit * 5]
      );
      return NextResponse.json(deduplicateNarrators(rows).slice(0, limit));
    }

    if (action === 'narrator') {
      const id = Number(searchParams.get('id'));
      const rows = await db.select<any[]>(
        `SELECT id, name_ar, name_en, name_bn, birth_year, death_year, tabaqah, reliability, city, data_source
         FROM narrators WHERE id = ?`,
        [id]
      );
      return NextResponse.json(rows[0] ?? null);
    }

    if (action === 'edges') {
      const id = Number(searchParams.get('id'));

      const teachers = await db.select<any[]>(
        `SELECT e.from_narrator_id, n.name_ar as from_name, n.name_en as from_name_en, n.name_bn as from_name_bn,
                e.to_narrator_id, nn.name_ar as to_name, nn.name_en as to_name_en, nn.name_bn as to_name_bn,
                e.hadith_count
         FROM narrator_edges e
         JOIN narrators n ON n.id = e.from_narrator_id
         JOIN narrators nn ON nn.id = e.to_narrator_id
         WHERE e.from_narrator_id = ? ORDER BY e.hadith_count DESC`,
        [id]
      );

      const students = await db.select<any[]>(
        `SELECT e.from_narrator_id, n.name_ar as from_name, n.name_en as from_name_en, n.name_bn as from_name_bn,
                e.to_narrator_id, nn.name_ar as to_name, nn.name_en as to_name_en, nn.name_bn as to_name_bn,
                e.hadith_count
         FROM narrator_edges e
         JOIN narrators n ON n.id = e.from_narrator_id
         JOIN narrators nn ON nn.id = e.to_narrator_id
         WHERE e.to_narrator_id = ? ORDER BY e.hadith_count DESC`,
        [id]
      );

      return NextResponse.json({ teachers, students });
    }

    if (action === 'graph') {
      const id = Number(searchParams.get('id'));
      const maxDepth = Math.min(Number(searchParams.get('depth') ?? '2'), 3);

      const nodes = new Map<number, any>();
      const edges = new Map<string, any>();

      async function bfs(currentIds: number[], depth: number) {
        if (depth > maxDepth || currentIds.length === 0) return;
        const placeholders = currentIds.map(() => '?').join(',');
        const outEdges = await db.select<any[]>(
          `SELECT e.from_narrator_id, n.name_ar as from_name, n.name_en as from_name_en,
                  n.name_bn as from_name_bn, n.tabaqah as from_tabaqah,
                  n.reliability as from_reliability, n.city as from_city,
                  n.data_source as from_data_source,
                  e.to_narrator_id, nn.name_ar as to_name, nn.name_en as to_name_en,
                  nn.name_bn as to_name_bn, nn.tabaqah as to_tabaqah,
                  nn.reliability as to_reliability, nn.city as to_city,
                  nn.data_source as to_data_source, e.hadith_count
           FROM narrator_edges e
           JOIN narrators n ON n.id = e.from_narrator_id
           JOIN narrators nn ON nn.id = e.to_narrator_id
           WHERE e.from_narrator_id IN (${placeholders})
           ORDER BY e.hadith_count DESC LIMIT 100`,
          currentIds
        );
        const nextIds: number[] = [];
        for (const e of outEdges) {
          const key = `${e.from_narrator_id}-${e.to_narrator_id}`;
          if (edges.has(key)) continue;
          edges.set(key, e);
          if (!nodes.has(e.from_narrator_id)) {
            nodes.set(e.from_narrator_id, {
              id: e.from_narrator_id, name_ar: e.from_name, name_en: e.from_name_en,
              name_bn: e.from_name_bn, tabaqah: e.from_tabaqah, reliability: e.from_reliability,
              city: e.from_city, data_source: e.from_data_source,
            });
          }
          if (!nodes.has(e.to_narrator_id)) {
            nodes.set(e.to_narrator_id, {
              id: e.to_narrator_id, name_ar: e.to_name, name_en: e.to_name_en,
              name_bn: e.to_name_bn, tabaqah: e.to_tabaqah, reliability: e.to_reliability,
              city: e.to_city, data_source: e.to_data_source,
            });
            nextIds.push(e.to_narrator_id);
          }
        }
        await bfs(nextIds, depth + 1);
      }

      const startRows = await db.select<any[]>(
        `SELECT id, name_ar, name_en, name_bn, birth_year, death_year, tabaqah, reliability, city, data_source
         FROM narrators WHERE id = ?`, [id]
      );
      if (startRows[0]) {
        nodes.set(id, startRows[0]);
        await bfs([id], 1);
      }

      return NextResponse.json({
        nodes: Array.from(nodes.values()),
        edges: Array.from(edges.values()),
      });
    }

    if (action === 'hadithsForEdge') {
      const from = Number(searchParams.get('from'));
      const to = Number(searchParams.get('to'));
      const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);

      const rows = await db.select<any[]>(
        `SELECT h.id as hadith_id, b.name_ar as book_name_ar, b.name_en as book_name_en,
                h.num_in_book, h.matn_ar, h.hadith_ar,
                ht_en.matn_text as matn_en, ht_bn.matn_text as matn_bn
         FROM hadiths h JOIN hadith_books b ON b.id = h.book_id
         LEFT JOIN hadith_translations ht_en ON ht_en.hadith_id = h.id AND ht_en.lang_code = 'en'
         LEFT JOIN hadith_translations ht_bn ON ht_bn.hadith_id = h.id AND ht_bn.lang_code = 'bn'
         JOIN hadith_narrators hn1 ON hn1.hadith_id = h.id
         JOIN hadith_narrators hn2 ON hn2.hadith_id = h.id AND hn2.position = hn1.position + 1
         WHERE hn1.narrator_id = ? AND hn2.narrator_id = ?
         ORDER BY h.id LIMIT ?`,
        [from, to, limit]
      );

      const result = [];
      for (const r of rows) {
        const chain = await db.select<any[]>(
          `SELECT n.id, n.name_ar, n.name_en, n.name_bn, n.birth_year, n.death_year,
                  n.tabaqah, n.reliability, n.city, n.data_source
           FROM hadith_narrators hn JOIN narrators n ON n.id = hn.narrator_id
           WHERE hn.hadith_id = ? ORDER BY hn.position`,
          [r.hadith_id]
        );
        result.push({ ...r, chain });
      }
      return NextResponse.json(result);
    }

    if (action === 'hadithChain') {
      const hadithId = Number(searchParams.get('id'));
      const hadithRows = await db.select<any[]>(
        `SELECT h.id, b.name_ar as book_name_ar, b.name_en as book_name_en,
                h.num_in_book, h.matn_ar, h.hadith_ar,
                ht_en.matn_text as matn_en, ht_bn.matn_text as matn_bn
         FROM hadiths h JOIN hadith_books b ON b.id = h.book_id
         LEFT JOIN hadith_translations ht_en ON ht_en.hadith_id = h.id AND ht_en.lang_code = 'en'
         LEFT JOIN hadith_translations ht_bn ON ht_bn.hadith_id = h.id AND ht_bn.lang_code = 'bn'
         WHERE h.id = ?`,
        [hadithId]
      );
      const chain = await db.select<any[]>(
        `SELECT n.id, n.name_ar, n.name_en, n.name_bn, n.birth_year, n.death_year,
                n.tabaqah, n.reliability, n.city, n.data_source
         FROM hadith_narrators hn JOIN narrators n ON n.id = hn.narrator_id
         WHERE hn.hadith_id = ? ORDER BY hn.position`,
        [hadithId]
      );
      return NextResponse.json({ hadith: hadithRows[0] ?? null, chain });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[API/chain]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
