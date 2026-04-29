import { NextRequest, NextResponse } from 'next/server';
import { getWebHadithDB } from '@/lib/web-db';

export const dynamic = 'force-dynamic';

function normalizeArabicQuery(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي');
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get('action');

  try {
    const db = getWebHadithDB();

    if (action === 'books') {
      const rows = await db.select(
        `SELECT id, name_ar, name_en, hadith_count FROM hadith_books
         WHERE hadith_count > 0 ORDER BY hadith_count DESC`
      );
      return NextResponse.json(rows);
    }

    if (action === 'stats') {
      const rows = await db.select<any[]>(
        `SELECT (SELECT count(*) FROM hadiths) AS hadith,
                (SELECT count(*) FROM hadith_books WHERE hadith_count > 0) AS books,
                (SELECT count(*) FROM narrators) AS narrators`
      );
      return NextResponse.json(rows[0] ?? { hadith: 0, books: 0, narrators: 0 });
    }

    if (action === 'search') {
      const query = searchParams.get('q') ?? '';
      const lang = searchParams.get('lang') ?? 'en';
      const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);
      if (!query.trim()) return NextResponse.json([]);

      const isArabic = /[\u0600-\u06FF]/.test(query);
      const useTranslatedFTS = !isArabic && ['en', 'bn'].includes(lang);
      let rows: any[] = [];

      if (useTranslatedFTS) {
        try {
          const ftsSql = `
            SELECT h.id, h.book_id, b.name_ar AS book_name_ar, b.name_en AS book_name_en,
                   h.num_in_book, h.hadith_ar, h.matn_ar,
                   ht.matn_text AS matn_en, h.sanad_length,
                   bm25(hadith_trans_search_idx) AS rank,
                   snippet(hadith_trans_search_idx, 0, '<mark>', '</mark>', '...', 32) AS snippet
            FROM hadith_trans_search_idx
            JOIN hadith_translations ht ON ht.id = hadith_trans_search_idx.rowid
            JOIN hadiths h ON h.id = ht.hadith_id
            JOIN hadith_books b ON b.id = h.book_id
            WHERE hadith_trans_search_idx MATCH ? AND ht.lang_code = ?
            ORDER BY bm25(hadith_trans_search_idx) +
                     CASE WHEN h.sanad_length <= 3 THEN -0.5
                          WHEN h.sanad_length <= 6 THEN -0.2 ELSE 0 END
            LIMIT ?
          `;
          rows = await db.select<any[]>(ftsSql, [query.trim(), lang, limit]);
        } catch { rows = []; }
      }

      if (rows.length === 0) {
        const cleanQuery = normalizeArabicQuery(query.trim());
        if (!cleanQuery) return NextResponse.json([]);
        const sql = `
          SELECT h.id, h.book_id, b.name_ar AS book_name_ar, b.name_en AS book_name_en,
                 h.num_in_book, h.hadith_ar, h.matn_ar,
                 ht_sunnah.matn_text AS sunnah_translation,
                  ht_hadith_api.matn_text AS hadith_api_translation,
                  ht_github.matn_text AS github_translation,
                  h.sanad_length,
                 bm25(hadith_search_idx) AS rank,
                 snippet(hadith_search_idx, 0, '<mark>', '</mark>', '...', 32) AS snippet
          FROM hadith_search_idx
          JOIN hadiths h ON h.id = hadith_search_idx.rowid
          JOIN hadith_books b ON b.id = h.book_id
          LEFT JOIN hadith_translations ht_sunnah ON ht_sunnah.hadith_id = h.id
            AND ht_sunnah.lang_code = 'en' AND ht_sunnah.translator = 'sunnah.com'
           LEFT JOIN hadith_translations ht_hadith_api ON ht_hadith_api.hadith_id = h.id
            AND ht_hadith_api.lang_code = 'bn' AND ht_hadith_api.translator = 'hadith-api'
           LEFT JOIN hadith_translations ht_github ON ht_github.hadith_id = h.id
            AND ht_github.lang_code = 'bn' AND ht_github.translator = 'github-classic'
          WHERE hadith_search_idx MATCH ?
          ORDER BY bm25(hadith_search_idx) +
                   CASE WHEN h.sanad_length <= 3 THEN -0.5
                        WHEN h.sanad_length <= 6 THEN -0.2 ELSE 0 END
          LIMIT ?
        `;
        rows = await db.select<any[]>(sql, [cleanQuery, limit]);
      }

      // Deduplicate by hadith ID
      const seen = new Set<number>();
      const deduped = rows.filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      return NextResponse.json(deduped.map(r => {
        const isBn = lang === 'bn';
        const matn_en = isBn
          ? (r.hadith_api_translation ?? r.github_translation ?? r.matn_en ?? null)
          : (r.sunnah_translation ?? r.matn_en ?? null);
        return {
          id: r.id, book_id: r.book_id, book_name_ar: r.book_name_ar,
          book_name_en: r.book_name_en, num_in_book: r.num_in_book,
          hadith_ar: r.hadith_ar, matn_ar: r.matn_ar,
          matn_en,
          sanad_length: r.sanad_length, rank: r.rank,
          snippet: r.snippet ?? r.matn_ar.slice(0, 160) + '...',
          translations: {
            sunnah: r.sunnah_translation ?? null,
            hadith_api: r.hadith_api_translation ?? null,
            github: r.github_translation ?? null,
          },
        };
      }));
    }

    if (action === 'byBook') {
      const bookId = Number(searchParams.get('bookId'));
      const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
      const perPage = Math.min(Number(searchParams.get('perPage') ?? '20'), 50);
      const lang = searchParams.get('lang') ?? 'en';
      const offset = (page - 1) * perPage;

      const countRows = await db.select<{ total: number }[]>(
        'SELECT COUNT(*) as total FROM hadiths WHERE book_id = ?', [bookId]
      );
      const total = countRows[0]?.total ?? 0;

      const rows = await db.select<any[]>(
        `SELECT h.id, h.book_id, b.name_ar AS book_name_ar, b.name_en AS book_name_en,
                h.num_in_book, h.hadith_ar, h.matn_ar,
                ht_sunnah.matn_text AS sunnah_translation,
                ht_hadith_api.matn_text AS hadith_api_translation,
                ht_github.matn_text AS github_translation,
                ht_qwen.matn_text AS qwen_translation,
                h.sanad_length, 0 AS rank
         FROM hadiths h JOIN hadith_books b ON b.id = h.book_id
         LEFT JOIN hadith_translations ht_sunnah ON ht_sunnah.hadith_id = h.id
           AND ht_sunnah.lang_code = 'en' AND ht_sunnah.translator = 'sunnah.com'
           LEFT JOIN hadith_translations ht_hadith_api ON ht_hadith_api.hadith_id = h.id
            AND ht_hadith_api.lang_code = 'bn' AND ht_hadith_api.translator = 'hadith-api'
           LEFT JOIN hadith_translations ht_github ON ht_github.hadith_id = h.id
            AND ht_github.lang_code = 'bn' AND ht_github.translator = 'github-classic'
           LEFT JOIN hadith_translations ht_qwen ON ht_qwen.hadith_id = h.id
            AND ht_qwen.lang_code = ? AND ht_qwen.translator = 'qwen3.5-9b'
          WHERE h.book_id = ? ORDER BY h.num_in_book ASC LIMIT ? OFFSET ?`,
        [lang, bookId, perPage, offset]
      );

      return NextResponse.json({
        hadiths: rows.map(r => {
          const isBn = lang === 'bn';
          const matn_en = isBn
            ? (r.hadith_api_translation ?? r.github_translation ?? r.sunnah_translation ?? null)
            : (r.sunnah_translation ?? null);
          return {
            id: r.id, book_id: r.book_id, book_name_ar: r.book_name_ar,
            book_name_en: r.book_name_en, num_in_book: r.num_in_book,
            hadith_ar: r.hadith_ar, matn_ar: r.matn_ar,
            matn_en,
            sanad_length: r.sanad_length, rank: 0,
            snippet: r.matn_ar,
            translations: {
              sunnah: r.sunnah_translation ?? null,
              hadith_api: r.hadith_api_translation ?? null,
              github: r.github_translation ?? null,
              qwen: r.qwen_translation ?? null,
            },
          };
        }),
        total, totalPages: Math.ceil(total / perPage), page, perPage,
      });
    }

    if (action === 'random') {
      const limit = Math.min(Number(searchParams.get('limit') ?? '15'), 50);
      const lang = searchParams.get('lang') ?? 'en';
      const rows = await db.select<any[]>(
        `SELECT h.id, h.book_id, b.name_ar AS book_name_ar, b.name_en AS book_name_en,
                h.num_in_book, h.hadith_ar, h.matn_ar,
                ht_sunnah.matn_text AS sunnah_translation,
                 ht_hadith_api.matn_text AS hadith_api_translation,
                 ht_github.matn_text AS github_translation,
                 ht_qwen.matn_text AS qwen_translation,
                 h.sanad_length, 0 AS rank
         FROM hadiths h JOIN hadith_books b ON b.id = h.book_id
         LEFT JOIN hadith_translations ht_sunnah ON ht_sunnah.hadith_id = h.id
           AND ht_sunnah.lang_code = 'en' AND ht_sunnah.translator = 'sunnah.com'
         LEFT JOIN hadith_translations ht_hadith_api ON ht_hadith_api.hadith_id = h.id
           AND ht_hadith_api.lang_code = 'bn' AND ht_hadith_api.translator = 'hadith-api'
         LEFT JOIN hadith_translations ht_github ON ht_github.hadith_id = h.id
           AND ht_github.lang_code = 'bn' AND ht_github.translator = 'github-classic'
         LEFT JOIN hadith_translations ht_qwen ON ht_qwen.hadith_id = h.id
           AND ht_qwen.lang_code = ? AND ht_qwen.translator = 'qwen3.5-9b'
         WHERE h.id IN (SELECT id FROM hadiths ORDER BY RANDOM() LIMIT ?)
         ORDER BY h.id`,
        [lang, limit]
      );
      return NextResponse.json(rows.map(r => {
        const isBn = lang === 'bn';
        const matn_en = isBn
          ? (r.hadith_api_translation ?? r.github_translation ?? r.sunnah_translation ?? null)
          : (r.sunnah_translation ?? null);
        return {
          id: r.id, book_id: r.book_id, book_name_ar: r.book_name_ar,
          book_name_en: r.book_name_en, num_in_book: r.num_in_book,
          hadith_ar: r.hadith_ar, matn_ar: r.matn_ar,
          matn_en,
          sanad_length: r.sanad_length, rank: 0, snippet: r.matn_ar,
          translations: {
            sunnah: r.sunnah_translation ?? null,
            hadith_api: r.hadith_api_translation ?? null,
            github: r.github_translation ?? null,
            qwen: r.qwen_translation ?? null,
          },
        };
      }));
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[API/hadith]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
