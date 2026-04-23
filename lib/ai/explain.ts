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

export interface VerseContext {
  surah: number;
  ayah: number;
  text_ar: string;
  text: string;
  translator_slug: string;
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
      reject(new Error('AI generation timed out after 15 seconds'));
    }, 15000);

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
function formatVersesFallback(verses: VerseContext[]): string {
  const lines = verses.map((v) => `[${v.surah}:${v.ayah}] ${v.text}`).join('\n\n');
  return `Here are the verses I found:\n\n${lines}\n\nHope this helps — let me know if you'd like to explore any of these further!`;
}

/**
 * Detect casual greetings / chitchat so we can reply naturally
 * without running the LLM on empty verse context.
 */
function detectChitchat(query: string): string | null {
  const q = query.toLowerCase().trim();
  const greetings = ['hi', 'hello', 'hey', 'salam', 'as-salamu alaykum', 'assalamualaikum'];
  const howAreYou = ['how are you', 'how r u', 'how is it going', 'how are things'];
  const identity = ['who are you', 'who am i talking to', 'what is your name', 'what are you'];
  const thanks = ['thank you', 'thanks', 'shukran', 'jazakallah'];

  if (greetings.some((g) => q.includes(g))) {
    return "Salam! I'm Hujjah AI, your companion for exploring the Quran. Ask me about any topic, verse, or surah — I'm here to help!";
  }
  if (howAreYou.some((h) => q.includes(h))) {
    return "I'm doing well, Alhamdulillah! Ready to explore the Quran with you. What would you like to know?";
  }
  if (identity.some((i) => q.includes(i))) {
    return "I'm Hujjah AI — a local, offline assistant built to help you understand and reflect on the Quran. Everything I share is grounded directly in Quranic verses.";
  }
  if (thanks.some((t) => q.includes(t))) {
    return "You're welcome! May Allah bless your journey with the Quran. Feel free to ask anytime.";
  }
  return null;
}

/**
 * Build a warm, conversational prompt grounded in retrieved verses.
 */
function buildPrompt(verses: VerseContext[]): string {
  const context = verses
    .map((v) => `[${v.surah}:${v.ayah}] ${v.text}`)
    .join('\n');

  return `You are a warm, knowledgeable Islamic research companion. Your tone is friendly, humble, and conversational — like a thoughtful friend or teacher sharing insights from the Quran.

Instructions:
- Use ONLY the verses provided below.
- Write 2-4 sentences that feel natural and human, not robotic.
- Gently weave in the verse references (e.g., "as mentioned in Surah Al-Baqarah [2:255]...").
- If the context is limited, acknowledge it honestly rather than making things up.
- Avoid sounding like a textbook. Use words like "Allah tells us," "the Quran reminds us," or "we find guidance in."

Provided verses:
${context}

Your response:`;
}

/**
 * Generate a warm explanation from retrieved verses.
 */
export async function explainVerse(query: string, verses: VerseContext[]): Promise<string> {
  // Handle greetings / small talk instantly without LLM
  const chitchat = detectChitchat(query);
  if (chitchat) return chitchat;

  if (verses.length === 0) {
    return "I couldn't find any verses closely related to that. Could you try rephrasing or asking about a specific topic from the Quran?";
  }

  // TODO: Re-enable LLM generation once model loading is fixed.
  // The 512MB Qwen ONNX model fails to load in Web Worker due to
  // Transformers.js routing fetches through HuggingFace Hub.
  // For now, return well-formatted verse references directly.
  return formatVersesFallback(verses);
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
 */
export async function explainQuery(
  query: string,
  lang: string = 'en'
): Promise<{ explanation: string; verses: VerseContext[] }> {
  // Fast path: greetings / small talk — no RAG needed
  const chitchat = detectChitchat(query);
  if (chitchat) {
    return { explanation: chitchat, verses: [] };
  }

  // Try to detect specific surah / verse references first
  const specificVerses = await detectSpecificVerses(query, lang);
  if (specificVerses && specificVerses.length > 0) {
    const explanation = await explainVerse(query, specificVerses);
    return { explanation, verses: specificVerses };
  }

  const db = await getDB();

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

  // Step 3: Score by similarity
  const scored = rows
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

  // Step 4: Generate explanation
  const explanation = await explainVerse(query, scored);

  return { explanation, verses: scored };
}
