import { NextRequest, NextResponse } from 'next/server';
import { getWebQuranDB } from '@/lib/web-db';
import { buildFTS5Queries, classifyQuery, detectLang, normalizeQuery } from '@/lib/search-utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get('action');

  try {
    const db = getWebQuranDB();

    if (action === 'surahs') {
      const rows = await db.select('SELECT id, name_ar, name_en, name_bn FROM surahs ORDER BY id');
      return NextResponse.json(rows);
    }

    if (action === 'surah') {
      const id = Number(searchParams.get('id'));
      const rows = await db.select<any[]>('SELECT id, name_ar, name_en, name_bn FROM surahs WHERE id = ?', [id]);
      return NextResponse.json(rows[0] ?? null);
    }

    if (action === 'verses') {
      const surah = Number(searchParams.get('surah'));
      const lang = searchParams.get('lang') ?? 'en';
      const translatorSlug = searchParams.get('translator') ?? null;

      if (lang === 'ar') {
        const rows = await db.select(
          `SELECT id, surah, ayah, text_ar, text_ar as text, 'arabic' as translator_slug
           FROM verses WHERE surah = ? ORDER BY ayah`,
          [surah]
        );
        return NextResponse.json(rows);
      }

      if (translatorSlug) {
        const rows = await db.select(
          `SELECT v.id, v.surah, v.ayah, v.text_ar, t.text, t.translator_slug
           FROM verses v JOIN translations t ON v.id = t.verse_id
           WHERE v.surah = ? AND t.lang_code = ? AND t.translator_slug = ?
           ORDER BY v.ayah`,
          [surah, lang, translatorSlug]
        );
        return NextResponse.json(rows);
      }

      const rows = await db.select(
        `SELECT v.id, v.surah, v.ayah, v.text_ar, t.text, t.translator_slug
         FROM verses v JOIN translations t ON v.id = t.verse_id
         WHERE v.surah = ? AND t.lang_code = ?
           AND t.rowid = (
             SELECT rowid FROM translations
             WHERE verse_id = v.id AND lang_code = ?
             ORDER BY CASE translator_slug
               WHEN 'sahih' THEN 1 WHEN 'bengali' THEN 1
               WHEN 'pickthall' THEN 2 WHEN 'yusufali' THEN 3
               WHEN 'arberry' THEN 4 WHEN 'shakir' THEN 5
               WHEN 'hilali' THEN 6 WHEN 'itani' THEN 7
               WHEN 'maududi' THEN 8 WHEN 'sarwar' THEN 9
               WHEN 'hoque' THEN 2 ELSE 10
             END, translator_slug LIMIT 1
           )
         ORDER BY v.ayah`,
        [surah, lang, lang]
      );
      return NextResponse.json(rows);
    }

    if (action === 'translators') {
      const surah = Number(searchParams.get('surah'));
      const lang = searchParams.get('lang') ?? 'en';
      const rows = await db.select(
        `SELECT t.translator_slug, COUNT(*) as count
         FROM translations t JOIN verses v ON v.id = t.verse_id
         WHERE v.surah = ? AND t.lang_code = ?
         GROUP BY t.translator_slug ORDER BY t.translator_slug`,
        [surah, lang]
      );
      return NextResponse.json(rows);
    }

    if (action === 'search') {
      const query = searchParams.get('q') ?? '';
      const lang = searchParams.get('lang') ?? 'en';
      const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);
      if (!query.trim()) return NextResponse.json([]);

      const queryLang = detectLang(query);
      const searchLang = queryLang === 'en' ? lang : queryLang;
      const classification = classifyQuery(query);

      // Reference lookup
      if (classification.type === 'reference' && classification.surah && classification.ayah) {
        const rows = await db.select<any[]>(
          `SELECT v.surah, v.ayah, v.text_ar, s.name_en, s.name_bn
           FROM verses v JOIN surahs s ON s.id = v.surah
           WHERE v.surah = ? AND v.ayah = ? LIMIT 1`,
          [classification.surah, classification.ayah]
        );
        if (rows.length === 0) return NextResponse.json([]);
        const r = rows[0];
        if (searchLang === 'ar') {
          return NextResponse.json([{
            type: 'ref', surah: r.surah, surah_name: r.name_en, ayah: r.ayah,
            text_ar: r.text_ar, text: r.text_ar, translator_slug: 'arabic',
            rank: 0, label: 'REF', snippet: r.text_ar,
          }]);
        }
        const trans = await db.select<any[]>(
          `SELECT text, translator_slug FROM translations
           WHERE verse_id = (SELECT id FROM verses WHERE surah = ? AND ayah = ?)
           AND lang_code = ? LIMIT 1`,
          [classification.surah, classification.ayah, searchLang]
        );
        const t = trans[0] ?? { text: r.text_ar, translator_slug: 'original' };
        return NextResponse.json([{
          type: 'ref', surah: r.surah,
          surah_name: searchLang === 'bn' ? r.name_bn : r.name_en,
          ayah: r.ayah, text_ar: r.text_ar, text: t.text,
          translator_slug: t.translator_slug, rank: 0, label: 'REF', snippet: t.text,
        }]);
      }

      // Surah name match
      const surahRows = await db.select<any[]>(
        `SELECT id, name_ar, name_en, name_bn FROM surahs
         WHERE LOWER(name_en) LIKE LOWER(?) OR LOWER(name_bn) LIKE LOWER(?) LIMIT 1`,
        [`%${query}%`, `%${query}%`]
      );
      if (surahRows.length > 0 && classification.type === 'surah') {
        const s = surahRows[0];
        return NextResponse.json([{
          type: 'surah', surah: s.id,
          surah_name: searchLang === 'bn' ? s.name_bn : s.name_en,
          ayah: 1, text_ar: '', text: `${s.name_en} (${s.name_ar})`,
          translator_slug: '', rank: 0, label: 'SURAH',
          snippet: `Jump to Surah ${s.id}`,
        }]);
      }

      // Arabic LIKE search
      if (searchLang === 'ar') {
        const normalized = normalizeQuery(query, 'ar');
        const rows = await db.select<any[]>(
          `SELECT v.surah, v.ayah, v.text_ar, s.name_en, s.name_bn, 0 AS rank, v.text_ar AS snippet
           FROM verses v JOIN surahs s ON s.id = v.surah
           WHERE v.text_ar LIKE ? ORDER BY v.surah, v.ayah LIMIT ?`,
          [`%${normalized}%`, limit]
        );
        return NextResponse.json(rows.map(r => ({
          type: 'verse', surah: r.surah, surah_name: r.name_en, ayah: r.ayah,
          text_ar: r.text_ar, text: r.text_ar, translator_slug: 'arabic',
          rank: r.rank, label: 'VERSE', snippet: r.snippet?.slice(0, 120) + '...',
        })));
      }

      // FTS5 keyword search
      const ftsQueries = buildFTS5Queries(query);
      const sql = `
        SELECT v.surah, v.ayah, v.text_ar, t.text, t.translator_slug,
               s.name_en, s.name_bn,
               bm25(quran_search_idx) AS rank,
               snippet(quran_search_idx, 0, '<mark>', '</mark>', '...', 32) AS snippet
        FROM quran_search_idx
        JOIN translations t ON t.id = quran_search_idx.rowid
        JOIN verses v ON v.id = t.verse_id
        JOIN surahs s ON s.id = v.surah
        WHERE quran_search_idx MATCH ? AND quran_search_idx.lang_code = ?
        ORDER BY bm25(quran_search_idx) LIMIT ?
      `;
      for (const ftsQuery of ftsQueries) {
        try {
          const rows = await db.select<any[]>(sql, [ftsQuery, searchLang, limit]);
          if (rows.length > 0) {
            return NextResponse.json(rows.map(r => ({
              type: 'verse', surah: r.surah,
              surah_name: searchLang === 'bn' ? r.name_bn : r.name_en,
              ayah: r.ayah, text_ar: r.text_ar, text: r.text,
              translator_slug: r.translator_slug, rank: r.rank, label: 'VERSE',
              snippet: r.snippet ?? r.text.slice(0, 120) + '...',
            })));
          }
        } catch { continue; }
      }
      return NextResponse.json([]);
    }

    if (action === 'verseCount') {
      const surah = Number(searchParams.get('surah'));
      if (!surah) return NextResponse.json({ error: 'surah required' }, { status: 400 });
      const rows = await db.select<any[]>('SELECT COUNT(*) as count FROM verses WHERE surah = ?', [surah]);
      return NextResponse.json({ count: rows[0]?.count ?? 0 });
    }

    if (action === 'stats') {
      const rows = await db.select<any[]>(
        `SELECT (SELECT count(*) FROM verses) AS verses,
                (SELECT count(*) FROM translations) AS translations,
                (SELECT count(DISTINCT lang_code) FROM translations) AS languages`
      );
      return NextResponse.json(rows[0] ?? { verses: 0, translations: 0, languages: 0 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[API/quran]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
