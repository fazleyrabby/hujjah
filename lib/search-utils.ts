/**
 * Pure search classification logic — testable without Tauri/SQLite.
 */

/**
 * Auto-detect whether a query string is Bengali or English.
 * Checks for Bengali Unicode block (U+0980–U+09FF).
 * Returns 'bn' if any Bengali character is found, 'en' otherwise.
 */
export function detectLang(query: string): 'en' | 'bn' {
  if (!query || !query.trim()) return 'en';
  if (/[\u0980-\u09FF]/.test(query)) return 'bn';
  return 'en';
}

export type QueryType = 'reference' | 'surah' | 'command' | 'keyword';

export interface ClassifiedQuery {
  type: QueryType;
  surah?: number;
  ayah?: number;
  command?: string;
  subQuery?: string;
  raw: string;
}

/**
 * Classify a user query into one of the search lanes.
 */
export function classifyQuery(raw: string): ClassifiedQuery {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { type: 'keyword', raw: trimmed };
  }

  // REFERENCE MODE: "2:255" or "24:35"
  const refMatch = trimmed.match(/^(\d+):(\d+)$/);
  if (refMatch) {
    return {
      type: 'reference',
      surah: parseInt(refMatch[1]),
      ayah: parseInt(refMatch[2]),
      raw: trimmed,
    };
  }

  // COMMAND MODE: "@quran mercy" or "@hadith prayer"
  const cmdMatch = trimmed.match(/^@(\w+)\s+(.+)$/);
  if (cmdMatch) {
    return {
      type: 'command',
      command: cmdMatch[1],
      subQuery: cmdMatch[2],
      raw: trimmed,
    };
  }

  // SURAH JUMP: exact surah name match (checked by caller against DB)
  // Surah names are typically 1-3 words, no common conjunctions
  if (/^[A-Za-z\s-]{2,25}$/.test(trimmed) && !/\b(and|or|the|of|in|on|at|to|for|with)\b/i.test(trimmed)) {
    return { type: 'surah', raw: trimmed };
  }

  // Default: KEYWORD LANE
  return { type: 'keyword', raw: trimmed };
}

/**
 * Strip all punctuation that causes FTS5 syntax errors, replacing with spaces.
 * Used by buildFTS5Queries internally.
 */
function stripFTS5Punctuation(raw: string): string {
  return raw
    .replace(/[.,!?;:*"{}()[\]^~+\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build one or more FTS5 MATCH expressions to try in order (best → broadest).
 * Returns an array of query strings; caller should try each until rows come back.
 *
 * Strategy:
 *   1. Phrase search  — "word1 word2 word3"  (exact adjacency, highest precision)
 *   2. AND search     — word1 word2 word3     (all words present, FTS5 default)
 *   3. OR search      — word1 OR word2 OR word3 (any word matches)
 *
 * Single-word queries skip straight to exact match (only one candidate).
 */
export function buildFTS5Queries(raw: string): string[] {
  const clean = stripFTS5Punctuation(raw);
  if (!clean) return [];

  const hasBengali = /[\u0980-\u09FF]/.test(clean);

  // Bengali conjunctions — collapse to OR tokens
  const bengaliConjRe = /\s+(ও|এবং|অথবা|কিংবা)\s+/;
  if (hasBengali && bengaliConjRe.test(clean)) {
    const tokens = clean
      .split(/\s+(ও|এবং|অথবা|কিংবা)\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !['ও', 'এবং', 'অথবা', 'কিংবা'].includes(t));
    return [tokens.join(' OR ')];
  }

  const words = clean.split(' ').filter(Boolean);
  if (words.length === 1) return [clean];

  // Bengali: AND is too strict — go straight to OR
  if (hasBengali) return [words.join(' OR ')];

  // English multi-word: phrase → AND → OR
  return [`"${clean}"`, clean, words.join(' OR ')];
}

/**
 * Sanitize a user query for safe FTS5 MATCH.
 * Strips special characters (collapsed to empty, not spaces) and handles
 * Bengali conjunctions → OR tokens. For new search code use buildFTS5Queries().
 */
export function sanitizeQuery(raw: string): string {
  const cleaned = raw
    .replace(/[*"{}()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Bengali conjunctions: ও, এবং, অথবা, কিংবা
  const bengaliConjunctions = /\s+(ও|এবং|অথবা|কিংবা)\s+/g;
  if (bengaliConjunctions.test(cleaned)) {
    const tokens = cleaned
      .split(/\s+(ও|এবং|অথবা|কিংবা)\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !['ও', 'এবং', 'অথবা', 'কিংবা'].includes(t));
    return tokens.join(' OR ');
  }

  const hasBengali = /[\u0980-\u09FF]/.test(cleaned);
  if (hasBengali) {
    const words = cleaned.split(' ').filter((w) => w.length > 0);
    if (words.length > 1 && !cleaned.includes(' OR ') && !cleaned.includes(' AND ') && !cleaned.includes(' NOT ')) {
      return words.join(' OR ');
    }
  }

  return cleaned;
}
