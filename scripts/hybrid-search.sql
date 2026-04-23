-- TASK 3: Hybrid Search Query for Unified Quran Vault
--
-- Retrieves Arabic text + a specific translation in one JOIN,
-- using FTS5 MATCH on the translation text.

-- 1. FTS5 keyword search on translation text
WITH fts_results AS (
  SELECT
    s.verse_id,
    s.lang_code,
    rank AS bm25_score
  FROM search_idx s
  WHERE s.text MATCH :query
    AND s.lang_code = :lang_code  -- e.g., 'en' for English
  ORDER BY bm25(search_idx)
  LIMIT 20
)

-- 2. Join with Arabic verses + translation text
SELECT
  v.id AS verse_id,
  v.surah,
  v.ayah,
  v.text_ar AS arabic_text,
  t.text AS translated_text,
  t.translator_slug,
  fts.bm25_score
FROM fts_results fts
JOIN verses v ON v.id = fts.verse_id
JOIN translations t ON t.verse_id = v.id
  AND t.lang_code = fts.lang_code
ORDER BY fts.bm25_score
LIMIT 5;

-- ─── Alternative: Multi-language search (any translation) ───
WITH fts_results AS (
  SELECT
    s.verse_id,
    s.lang_code,
    rank AS bm25_score
  FROM search_idx s
  WHERE s.text MATCH :query
  ORDER BY bm25(search_idx)
  LIMIT 20
)
SELECT
  v.id AS verse_id,
  v.surah,
  v.ayah,
  v.text_ar AS arabic_text,
  t.text AS translated_text,
  t.lang_code,
  t.translator_slug,
  fts.bm25_score
FROM fts_results fts
JOIN verses v ON v.id = fts.verse_id
JOIN translations t ON t.verse_id = v.id
  AND t.lang_code = fts.lang_code
ORDER BY fts.bm25_score
LIMIT 5;

-- ─── Alternative: Search Arabic text directly (no FTS5 needed) ───
SELECT
  v.id AS verse_id,
  v.surah,
  v.ayah,
  v.text_ar AS arabic_text,
  t.text AS translated_text,
  t.lang_code,
  t.translator_slug
FROM verses v
LEFT JOIN translations t ON t.verse_id = v.id AND t.lang_code = :lang_code
WHERE v.text_ar LIKE '%' || :arabic_query || '%'
LIMIT 5;

-- ─── Get all translations for a verse ───
SELECT
  v.id,
  v.surah,
  v.ayah,
  v.text_ar,
  t.lang_code,
  t.translator_slug,
  t.text
FROM verses v
JOIN translations t ON t.verse_id = v.id
WHERE v.id = :verse_id;
