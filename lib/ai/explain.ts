/**
 * lib/ai/explain.ts
 *
 * Local AI Explanation Pipeline
 *
 * Generates a 3-sentence explanation strictly from retrieved verses.
 * Uses a lightweight text-generation model via Transformers.js Web Worker.
 *
 * REQUIRED: qwen-onnx model in src-tauri/resources/models/qwen-onnx
 * (symlinked to public/models for web access)
 */

import { getDB } from '@/lib/db';
import { embedOne, cosineSimilarity } from './embedding';
import { searchHadithKeyword, type HadithResult } from '@/lib/hadith-db';

export interface VerseContext {
  surah: number;
  ayah: number;
  text_ar: string;
  text: string;
  translator_slug: string;
}

export interface HadithContext {
  id: number;
  book_name_ar: string;
  book_name_en: string | null;
  num_in_book: number;
  matn_ar: string;
  sanad_length: number;
}

/**
 * Search hadith corpus for relevant results (FTS5 keyword search).
 * Returns top matching hadith as HadithContext.
 */
async function searchHadithForAI(query: string, limit = 3): Promise<HadithContext[]> {
  try {
    const results = await searchHadithKeyword(query, limit);
    return results.map((r: HadithResult) => ({
      id: r.id,
      book_name_ar: r.book_name_ar,
      book_name_en: r.book_name_en,
      num_in_book: r.num_in_book,
      matn_ar: r.matn_ar,
      sanad_length: r.sanad_length,
    }));
  } catch {
    return [];
  }
}

let worker: Worker | null = null;
const pending = new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/generation.worker.ts', import.meta.url));
    worker.addEventListener('message', (event: MessageEvent<{ id: string; type: string; text?: string; error?: string }>) => {
      const { id, type, text, error } = event.data;
      // Ignore intermediate status messages — only terminal types resolve/reject
      if (type === 'loading') return;
      const handler = pending.get(id);
      if (!handler) return;
      pending.delete(id);
      if (type === 'generate' && text !== undefined) {
        handler.resolve(text);
      } else {
        handler.reject(new Error(error || 'Generation failed'));
      }
    });
  }
  return worker;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Pre-load the generation model in the background.
 * Call this on app startup so the first query is fast.
 */
export function warmUpGenerationModel(): void {
  const w = getWorker();
  const id = makeId();
  w.postMessage({ id, type: 'init' });
}

/**
 * Generate text via the Web Worker with a 30s timeout.
 */
async function generate(prompt: string, maxNewTokens = 80): Promise<string> {
  const id = makeId();
  const w = getWorker();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('AI generation timed out after 120 seconds'));
    }, 120000);

    pending.set(id, {
      resolve: (text: string) => {
        clearTimeout(timeout);
        resolve(text);
      },
      reject: (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      },
    });
    w.postMessage({ id, type: 'generate', prompt, maxNewTokens });
  });
}

/**
 * Format verses as a readable fallback when the LLM fails.
 */
function truncate(text: string, maxLen: number = 120): string {
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(' ', maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen) + '...';
}

function formatVersesFallback(verses: VerseContext[], query: string = '', lang: string = 'en'): string {
  if (verses.length === 0) {
    return lang === 'bn'
      ? 'এই বিষয়ে কোনো আয়াত পাওয়া যায়নি।'
      : 'No relevant verses found for this topic.';
  }

  const refs = verses.map((v) => `${v.surah}:${v.ayah}`).join(', ');
  const top = verses.slice(0, 2);

  if (lang === 'bn') {
    const intro = query.trim()
      ? `কুরআনে "${query}" বিষয়ে ${verses.length}টি প্রাসঙ্গিক আয়াত পাওয়া গেছে (${refs})।`
      : `${verses.length}টি প্রাসঙ্গিক আয়াত পাওয়া গেছে (${refs})।`;
    const snippets = top.map((v) => `[${v.surah}:${v.ayah}] — ${truncate(v.text, 140)}`).join('\n\n');
    return `${intro}\n\n${snippets}`;
  }

  const intro = query.trim()
    ? `The Quran speaks about "${query}" across ${verses.length} relevant verse${verses.length > 1 ? 's' : ''} (${refs}).`
    : `Found ${verses.length} relevant verse${verses.length > 1 ? 's' : ''} (${refs}).`;
  const snippets = top.map((v) => `[${v.surah}:${v.ayah}] — ${truncate(v.text, 140)}`).join('\n\n');
  return `${intro}\n\n${snippets}`;
}

/**
 * Detect casual greetings / chitchat so we can reply naturally
 * without running the LLM on empty verse context.
 */
function detectChitchat(query: string, lang: string = 'en'): string | null {
  const q = query.toLowerCase().trim();
  const isBn = lang === 'bn';
  const greetings = ['hi', 'hello', 'hey', 'salam', 'as-salamu alaykum', 'assalamualaikum', 'আসসালামু', 'সালাম', 'হ্যালো'];
  const howAreYou = ['how are you', 'how r u', 'how is it going', 'কেমন আছ', 'কেমন আছেন'];
  const identity = ['who are you', 'who am i talking to', 'what is your name', 'what are you', 'তুমি কে', 'আপনি কে'];
  const thanks = ['thank you', 'thanks', 'shukran', 'jazakallah', 'ধন্যবাদ', 'জাযাকাল্লাহ', 'শুকরিয়া'];

  if (greetings.some((g) => q.includes(g))) {
    return isBn
      ? "সালাম! আমি হুজ্জাহ এআই, কুরআন অনুসন্ধানে আপনার সঙ্গী। যেকোনো বিষয়, আয়াত বা সূরা সম্পর্কে জিজ্ঞাসা করুন!"
      : "Salam! I'm Hujjah AI, your companion for exploring the Quran. Ask me about any topic, verse, or surah — I'm here to help!";
  }
  if (howAreYou.some((h) => q.includes(h))) {
    return isBn
      ? "আলহামদুলিল্লাহ, ভালো আছি! কুরআন নিয়ে কিছু জানতে চাইলে জিজ্ঞাসা করুন।"
      : "I'm doing well, Alhamdulillah! Ready to explore the Quran with you. What would you like to know?";
  }
  if (identity.some((i) => q.includes(i))) {
    return isBn
      ? "আমি হুজ্জাহ এআই — কুরআন বোঝা ও গবেষণায় সাহায্যকারী একটি স্থানীয়, অফলাইন সহকারী। আমার সকল তথ্য সরাসরি কুরআনের আয়াত থেকে নেওয়া।"
      : "I'm Hujjah AI — a local, offline assistant built to help you understand and reflect on the Quran. Everything I share is grounded directly in Quranic verses.";
  }
  if (thanks.some((t) => q.includes(t))) {
    return isBn
      ? "আপনাকে স্বাগতম! কুরআনের পথে আল্লাহ আপনাকে বরকত দিন। যেকোনো সময় জিজ্ঞাসা করতে পারেন।"
      : "You're welcome! May Allah bless your journey with the Quran. Feel free to ask anytime.";
  }
  return null;
}

// ─── Query Intent Classification ───

export type QueryIntent = 'explain' | 'summarize' | 'factual' | 'search';

/**
 * Classify the user's intent to tailor the prompt and response style.
 * - explain: "what does X mean", "explain", "why", "how"
 * - summarize: "summarize", "brief overview", "tldr"
 * - factual: "what is", "who is", "when", "where"
 * - search: "find", "show me", "list", bare noun queries
 */
export function classifyIntent(query: string): QueryIntent {
  const q = query.toLowerCase().trim();
  if (/\b(explain|clarify|elaborate|describe|tell me about|what does .+ mean|why |how )\b/.test(q)) return 'explain';
  if (/\b(summarize|summary|overview|brief|tldr|in short)\b/.test(q)) return 'summarize';
  if (/\b(what is|what are|who is|who are|when |where |define)\b/.test(q)) return 'factual';
  return 'search';
}

// ─── Phase 2 Step 3: Structured Context Builder ───

interface StructuredContext {
  quran: Array<{ ref: string; arabic: string; translation: string }>;
  hadith: Array<{ ref: string; arabic: string }>;
}

function buildStructuredContext(
  verses: VerseContext[],
  hadith: HadithContext[]
): StructuredContext {
  return {
    quran: verses.slice(0, 5).map((v) => ({
      ref: `${v.surah}:${v.ayah}`,
      arabic: v.text_ar,
      translation: v.text,
    })),
    hadith: hadith.slice(0, 2).map((h) => ({
      ref: `${h.book_name_en || h.book_name_ar} #${h.num_in_book}`,
      arabic: h.matn_ar.slice(0, 300),
    })),
  };
}

// ─── Phase 2 Step 4: Strict Grounding Prompt ───

function buildStrictPrompt(query: string, ctx: StructuredContext, lang: string, intent?: QueryIntent): string {
  const quranLines = ctx.quran
    .map((v) => `[Quran ${v.ref}] ${v.translation}`)
    .join('\n');
  const hadithLines = ctx.hadith
    .map((h) => `[Hadith ${h.ref}] ${h.arabic}`)
    .join('\n');
  const contextBlock = [quranLines, hadithLines].filter(Boolean).join('\n\n');

  if (!contextBlock.trim()) {
    return lang === 'bn'
      ? `প্রদত্ত উৎসে পাওয়া যায়নি।`
      : `Not found in provided sources.`;
  }

  if (lang === 'bn') {
    return `তুমি কুরআন ও হাদিসের একজন সহকারী।

কঠোর নিয়ম:
- শুধুমাত্র নিচের প্রদত্ত সূত্র ব্যবহার করো
- বাইরের জ্ঞান যোগ করো না
- সূত্রে না থাকলে বলো: "প্রদত্ত উৎসে পাওয়া যায়নি।"
- উদ্ধৃতি দাও (যেমন: ২:২৫৫)

সূত্র:
${contextBlock}

প্রশ্ন: ${query}

সংক্ষিপ্ত উত্তর:`;
  }

  const instruction =
    intent === 'summarize'
      ? 'Provide a brief 2-sentence summary based only on the sources below.'
      : intent === 'factual'
      ? 'Answer directly and concisely using only the sources below.'
      : intent === 'explain'
      ? 'Explain clearly in 2-3 sentences using only the sources below. Mention what the texts say.'
      : 'Using the sources below, respond to the question in 2-3 sentences.';

  return `You are an assistant for Qur'an and Hadith.

STRICT RULES:
- Use ONLY the provided context below
- Do NOT add interpretations beyond the text
- Do NOT introduce external knowledge
- If context is insufficient, say: "Not found in provided sources."
- Always cite references like (Quran 2:255) or (Bukhari #1)

${instruction}

Context:
${contextBlock}

Question: ${query}

Answer:`;
}

// ─── Phase 2 Step 5: Output Validation ───

/**
 * Check if generated output is grounded in provided context.
 * Validates by checking if key nouns/verbs from output exist in context words.
 * Falls back to extractive summary if output seems ungrounded.
 */
function validateOutput(output: string, ctx: StructuredContext): boolean {
  if (!output || output.length < 10) return false;

  // Build word set from all context text
  const contextText = [
    ...ctx.quran.map((v) => v.translation),
    ...ctx.hadith.map((h) => h.arabic),
  ].join(' ').toLowerCase();

  const contextWords = new Set(
    contextText.split(/\s+/).map((w) => w.replace(/[^a-z]/g, ''))
  );

  // Extract content words from output (skip short function words)
  const outputWords = output
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/g, ''))
    .filter((w) => w.length > 4);

  if (outputWords.length === 0) return true;

  // If >60% of output content words not in context → likely hallucinated
  const misses = outputWords.filter((w) => !contextWords.has(w)).length;
  return misses / outputWords.length < 0.6;
}

// ─── Phase 6: Low-End Device Detection ───

/**
 * Detect if device has constrained memory (< 3GB).
 * Uses navigator.deviceMemory (Chrome/Edge) when available.
 */
export function isLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (mem !== undefined) return mem < 3;
  return false;
}

// ─── Phase 7: Query Cache ───

interface CacheEntry {
  explanation: string;
  verses: VerseContext[];
  hadith: HadithContext[];
}

const queryCache = new Map<string, CacheEntry>();
const CACHE_MAX = 10;

function cacheGet(key: string): CacheEntry | undefined {
  return queryCache.get(key);
}

function cacheSet(key: string, value: CacheEntry): void {
  if (queryCache.size >= CACHE_MAX) {
    // Evict oldest entry
    const firstKey = queryCache.keys().next().value;
    if (firstKey) queryCache.delete(firstKey);
  }
  queryCache.set(key, value);
}

// ─── Prompt Builder (kept for verse-only fallback) ───

function buildPrompt(query: string, verses: VerseContext[], lang: string = 'en'): string {
  const ctx = buildStructuredContext(verses, []);
  return buildStrictPrompt(query, ctx, lang);
}

/**
 * Generate a grounded explanation from retrieved verses.
 * Falls back to extractive summary if model fails or output fails validation.
 */
export async function explainVerse(query: string, verses: VerseContext[], lang: string = 'en'): Promise<string> {
  // Handle greetings / small talk instantly without LLM
  const chitchat = detectChitchat(query, lang);
  if (chitchat) return chitchat;

  if (verses.length === 0) {
    return lang === 'bn'
      ? "প্রদত্ত উৎসে পাওয়া যায়নি।"
      : "Not found in provided sources.";
  }

  // Low-end devices: skip LLM, return extractive summary only
  if (isLowEndDevice()) {
    return formatVersesFallback(verses, query, lang);
  }

  const ctx = buildStructuredContext(verses, []);
  try {
    const prompt = buildPrompt(query, verses, lang);
    const text = await generate(prompt, 150);
    if (text) {
      if (validateOutput(text, ctx)) return text;
      // Output failed validation — fall back to extractive
      console.warn('[Explain] Output failed grounding validation, using extractive fallback');
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Explain] Generation failed, using fallback:', message);
  }
  return formatVersesFallback(verses, query, lang);
}

/**
 * Detect if the query references a specific surah or verse range.
 * Returns specific verses if matched, null otherwise.
 */
async function detectSpecificVerses(query: string, lang: string): Promise<VerseContext[] | null> {
  const q = query.toLowerCase();
  const db = await getDB();

  // Pattern 1: "surah fatiha" / "surah al-baqarah" / "chapter 2"
  const surahMatch = q.match(/(?:surah|chapter)\s+([\w\s-]+)/);
  const numMatch = q.match(/(?:surah|chapter)\s+(\d+)/);

  let surahId: number | null = null;

  if (numMatch) {
    surahId = parseInt(numMatch[1], 10);
  } else if (surahMatch) {
    const name = surahMatch[1].trim();
    const sql = `SELECT id FROM surahs WHERE LOWER(name_en) = LOWER(?) OR LOWER(name_bn) = LOWER(?) LIMIT 1`;
    const rows = await db.select<{ id: number }[]>(sql, [name, name]);
    if (rows.length > 0) surahId = rows[0].id;

    // Try partial match
    if (!surahId) {
      const sql2 = `SELECT id FROM surahs WHERE LOWER(name_en) LIKE LOWER(?) OR LOWER(name_bn) LIKE LOWER(?) LIMIT 1`;
      const rows2 = await db.select<{ id: number }[]>(sql2, [`%${name}%`, `%${name}%`]);
      if (rows2.length > 0) surahId = rows2[0].id;
    }
  }

  // Pattern 2: explicit range "2:1-5" or "verses 2:1 to 2:5"
  const rangeMatch = q.match(/(\d+):(\d+)\s*(?:-|to|through)\s*(\d+):(\d+)/);
  const simpleRangeMatch = q.match(/(\d+):(\d+)\s*(?:-|to|through)\s*(\d+)/);

  if (rangeMatch) {
    const s1 = parseInt(rangeMatch[1], 10);
    const a1 = parseInt(rangeMatch[2], 10);
    const a2 = parseInt(rangeMatch[4], 10);
    return fetchVerseRange(s1, a1, a2, lang);
  }
  if (simpleRangeMatch) {
    const s = parseInt(simpleRangeMatch[1], 10);
    const a1 = parseInt(simpleRangeMatch[2], 10);
    const a2 = parseInt(simpleRangeMatch[3], 10);
    return fetchVerseRange(s, a1, a2, lang);
  }

  // If we found a surah, determine how many verses to fetch
  if (surahId) {
    // "first few verses" / "beginning" / "first 5 verses"
    const fewMatch = q.match(/first\s+(\d+)/);
    const isBeginning = q.includes('beginning') || q.includes('first few') || q.includes('start') || q.includes('opening');
    const isFull = q.includes('all') || q.includes('whole') || q.includes('entire') || q.includes('full');

    if (fewMatch) {
      const count = parseInt(fewMatch[1], 10);
      return fetchVerseRange(surahId, 1, count, lang);
    }
    if (isBeginning) {
      return fetchVerseRange(surahId, 1, Math.min(7, await getSurahVerseCount(surahId)), lang);
    }
    if (isFull) {
      const count = await getSurahVerseCount(surahId);
      return fetchVerseRange(surahId, 1, count, lang);
    }

    // Default: fetch first 5 verses of the mentioned surah for context
    return fetchVerseRange(surahId, 1, Math.min(5, await getSurahVerseCount(surahId)), lang);
  }

  return null;
}

async function getSurahVerseCount(surah: number): Promise<number> {
  const db = await getDB();
  const sql = 'SELECT COUNT(*) as count FROM verses WHERE surah = ?';
  const rows = await db.select<{ count: number }[]>(sql, [surah]);
  return rows[0]?.count ?? 0;
}

async function fetchVerseRange(surah: number, startAyah: number, endAyah: number, lang: string): Promise<VerseContext[]> {
  const db = await getDB();
  const sql = `
    SELECT v.surah, v.ayah, v.text_ar, t.text, t.translator_slug
    FROM verses v
    JOIN translations t ON v.id = t.verse_id
    WHERE v.surah = ? AND v.ayah >= ? AND v.ayah <= ? AND t.lang_code = ?
    ORDER BY v.ayah
    LIMIT 50
  `;
  const rows = await db.select<VerseContext[]>(sql, [surah, startAyah, endAyah, lang]);

  // Deduplicate: keep only one translation per verse (prefer 'sahih' or 'bengali')
  const seen = new Set<string>();
  const deduped: VerseContext[] = [];
  for (const r of rows) {
    const key = `${r.surah}:${r.ayah}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  return deduped;
}

/**
 * Retrieve relevant verses for a query, then explain them.
 * This is the full RAG pipeline: query → embed → retrieve → explain.
 * Also retrieves relevant hadith from the Kutub al-Sittah corpus.
 */
export async function explainQuery(
  query: string,
  lang: string = 'en'
): Promise<{ explanation: string; verses: VerseContext[]; hadith: HadithContext[] }> {
  // Fast path: greetings / small talk — no RAG needed
  const chitchat = detectChitchat(query, lang);
  if (chitchat) {
    return { explanation: chitchat, verses: [], hadith: [] };
  }

  // Phase 7: Check query cache (last 10 queries)
  const cacheKey = `${lang}:${query.trim().toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  // Classify intent to tailor prompt
  const intent = classifyIntent(query);

  // Phase 6: Low-end device — keyword-only, no embedding
  const lowEnd = isLowEndDevice();

  // Try to detect specific surah / verse references first
  const specificVerses = await detectSpecificVerses(query, lang);
  if (specificVerses && specificVerses.length > 0) {
    const explanation = await explainVerse(query, specificVerses, lang);
    const result = { explanation, verses: specificVerses, hadith: [] };
    cacheSet(cacheKey, result);
    return result;
  }

  const db = await getDB();

  let scored: VerseContext[] = [];

  if (lowEnd) {
    // Low-end: FTS5 keyword search only, no embedding computation
    const ftsQuery = query.trim().toLowerCase();
    const ftsSql = `
      SELECT v.surah, v.ayah, v.text_ar, t.text, t.translator_slug
      FROM quran_search_idx
      JOIN translations t ON t.id = quran_search_idx.rowid
      JOIN verses v ON v.id = t.verse_id
      WHERE quran_search_idx MATCH ? AND quran_search_idx.lang_code = ?
      ORDER BY bm25(quran_search_idx)
      LIMIT 5
    `;
    try {
      const ftsRows = await db.select<VerseContext[]>(ftsSql, [ftsQuery, lang]);
      scored = ftsRows;
    } catch {
      scored = [];
    }
  } else {
    // Step 1: Embed the query
    const queryEmbedding = await embedOne(query);

    // Step 2: Load translations with embeddings (limit to 5000 for speed)
    const sql = `
      SELECT
        v.surah,
        v.ayah,
        v.text_ar,
        t.text,
        t.translator_slug,
        t.embedding
      FROM translations t
      JOIN verses v ON v.id = t.verse_id
      WHERE t.lang_code = ? AND t.embedding IS NOT NULL
      LIMIT 5000
    `;

    const rows = await db.select<
      {
        surah: number;
        ayah: number;
        text_ar: string;
        text: string;
        translator_slug: string;
        embedding: ArrayBuffer;
      }[]
    >(sql, [lang]);

    // Step 3: Score by cosine similarity, cap at 5 results
    scored = rows
      .filter((r) => r.embedding)
      .map((r) => ({
        surah: r.surah,
        ayah: r.ayah,
        text_ar: r.text_ar,
        text: r.text,
        translator_slug: r.translator_slug,
        similarity: cosineSimilarity(queryEmbedding, new Float32Array(r.embedding)),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }

  // Step 4: Search hadith corpus (Arabic FTS5, top 2 results)
  const hadithResults = lowEnd ? [] : await searchHadithForAI(query, 2);

  // Step 5: Build structured context and strict prompt
  let explanation: string;
  if (scored.length === 0 && hadithResults.length === 0) {
    explanation = lang === 'bn'
      ? 'প্রদত্ত উৎসে পাওয়া যায়নি।'
      : 'Not found in provided sources.';
  } else if (lowEnd) {
    // Low-end: extractive only, no LLM
    explanation = formatVersesFallback(scored, query, lang);
  } else {
    const ctx = buildStructuredContext(scored, hadithResults);
    try {
      const prompt = buildHadithPrompt(query, scored, hadithResults, lang, intent);
      const raw = await generate(prompt, 150);
      if (raw && validateOutput(raw, ctx)) {
        explanation = raw;
      } else {
        if (raw) console.warn('[Explain] Output failed grounding validation, using extractive fallback');
        explanation = formatVersesFallback(scored, query, lang);
      }
    } catch (err) {
      console.error('[Explain] Generation failed:', err);
      explanation = formatVersesFallback(scored, query, lang);
    }
  }

  const result = { explanation, verses: scored, hadith: hadithResults };
  cacheSet(cacheKey, result);
  return result;
}

/**
 * Build a strict grounding prompt for combined Quran + Hadith context.
 */
function buildHadithPrompt(
  query: string,
  verses: VerseContext[],
  hadith: HadithContext[],
  lang: string = 'en',
  intent?: QueryIntent
): string {
  const ctx = buildStructuredContext(verses, hadith);
  return buildStrictPrompt(query, ctx, lang, intent);
}
