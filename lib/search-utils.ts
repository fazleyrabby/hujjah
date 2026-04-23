/**
 * Pure search classification logic — testable without Tauri/SQLite.
 */

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
 * Sanitize a user query for safe FTS5 MATCH.
 * Removes special characters that could break the query.
 * For Bengali, strips common conjunctions and converts to OR-separated tokens
 * so compound queries like "সালাত ও সবর" match verses containing either word.
 */
export function sanitizeQuery(raw: string): string {
  const cleaned = raw
    .replace(/[*"{}()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Bengali conjunctions: ও, এবং, অথবা, কিংবা
  // Split on these and build an OR query for FTS5
  const bengaliConjunctions = /\s+(ও|এবং|অথবা|কিংবা)\s+/g;
  if (bengaliConjunctions.test(cleaned)) {
    const tokens = cleaned
      .split(bengaliConjunctions)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !['ও', 'এবং', 'অথবা', 'কিংবা'].includes(t));
    return tokens.join(' OR ');
  }

  // For Bengali multi-word queries without explicit operators, use OR
  // FTS5 default is AND for spaces, which is too restrictive for Bengali
  const hasBengali = /[\u0980-\u09FF]/.test(cleaned);
  if (hasBengali) {
    const words = cleaned.split(' ').filter((w) => w.length > 0);
    if (words.length > 1 && !cleaned.includes(' OR ') && !cleaned.includes(' AND ') && !cleaned.includes(' NOT ')) {
      return words.join(' OR ');
    }
  }

  return cleaned;
}
