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
 * Generate text via the Web Worker.
 */
async function generate(prompt: string, maxNewTokens = 80): Promise<string> {
  const id = makeId();
  const w = getWorker();

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type: 'generate', prompt, maxNewTokens });
  });
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

  try {
    const prompt = buildPrompt(verses);
    const text = await generate(prompt, 100);
    return text || "Here's what I found from the verses above. Let me know if you'd like to explore further!";
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Explain] Generation failed:', message);
    return "Hmm, I'm having trouble thinking that through right now. Could you try again in a moment?";
  }
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

  const db = await getDB();

  // Step 1: Embed the query
  const queryEmbedding = await embedOne(query);

  // Step 2: Load translations with embeddings
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

  // Step 3: Score by similarity (limit to top 200 for speed)
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
