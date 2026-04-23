/**
 * lib/ai/explain.ts
 *
 * Local AI Explanation Pipeline
 *
 * Generates a 3-sentence explanation strictly from retrieved verses.
 * Uses a lightweight text-generation model via Transformers.js.
 *
 * REQUIRED: Download a text generation model to src-tauri/resources/models/
 * Recommended: Qwen2.5-0.5B-Instruct or Gemma-3-1B-IT
 */

import { pipeline, env } from '@huggingface/transformers';
import { getDB } from '@/lib/db';
import { embedOne } from './embedding';
import { cosineSimilarity } from './embedding';

export interface VerseContext {
  surah: number;
  ayah: number;
  text_ar: string;
  text: string;
  translator_slug: string;
}

let generator: Awaited<ReturnType<typeof pipeline>> | null = null;
let modelLoading = false;

/**
 * Initialize the text generation model (lazy loading).
 */
async function initGenerator() {
  if (generator) return generator;
  if (modelLoading) {
    // Wait for existing load
    while (modelLoading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return generator;
  }

  modelLoading = true;
  try {
    env.localModelPath = './src-tauri/resources/models';
    env.allowRemoteModels = false;

    // NOTE: Replace with your downloaded model name
    // Options: 'Qwen/Qwen2.5-0.5B-Instruct', 'google/gemma-3-1b-it'
    generator = await pipeline('text-generation', 'Qwen2.5-0.5B-Instruct', {
      quantized: true,
    } as any);

    return generator;
  } catch (err) {
    console.error('[Explain] Failed to load model:', err);
    throw new Error(
      'Text generation model not found. Download Qwen2.5-0.5B-Instruct or Gemma-3-1B-IT to src-tauri/resources/models/'
    );
  } finally {
    modelLoading = false;
  }
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
    const gen = await initGenerator();
    const prompt = buildPrompt(verses);

    const output = await (gen as any)(prompt, {
      max_new_tokens: 120,
      temperature: 0.1, // Low temperature for determinism
      do_sample: false,
      return_full_text: false,
    });

    const text = output?.[0]?.generated_text as string;
    if (!text) return 'Insufficient context.';

    return text.trim();
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
