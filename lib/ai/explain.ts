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
 * Generate text via the Web Worker.
 */
async function generate(prompt: string, maxNewTokens = 120): Promise<string> {
  const id = makeId();
  const w = getWorker();

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type: 'generate', prompt, maxNewTokens });
  });
}

/**
 * Build a strict prompt that only uses provided verses.
 */
function buildPrompt(verses: VerseContext[]): string {
  const context = verses
    .map((v) => `[${v.surah}:${v.ayah}] ${v.text}`)
    .join('\n');

  return `You are a Quran research assistant.

ONLY use the provided verses.

Summarize in 3 short sentences.

Rules:
- Do NOT add external knowledge
- Do NOT interpret beyond text
- If unclear, say "Insufficient context"
- Include references like [2:255]

Context:
${context}

Explanation:`;
}

/**
 * Generate a 3-sentence explanation strictly from retrieved verses.
 */
export async function explainVerse(verses: VerseContext[]): Promise<string> {
  if (verses.length === 0) {
    return 'Insufficient context to provide an explanation.';
  }

  try {
    const prompt = buildPrompt(verses);
    const text = await generate(prompt, 120);
    return text || 'Insufficient context.';
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Explain] Generation failed:', message);
    return `Unable to generate explanation: ${message}`;
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
  const explanation = await explainVerse(scored);

  return { explanation, verses: scored };
}
