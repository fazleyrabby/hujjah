/**
 * lib/ai/embedding.ts
 *
 * Embedding Pipeline
 * - Loads all-MiniLM-L6-v2 model via Transformers.js
 * - Runs inside Web Worker to avoid blocking UI
 * - Caches model in memory (no re-loading per request)
 */

export type EmbeddingVector = Float32Array;

interface EmbedMessage {
  id: string;
  type: 'embed';
  texts: string[];
}

interface EmbedResponse {
  id: string;
  type: 'embed' | 'error';
  embeddings?: number[][];
  error?: string;
}

let worker: Worker | null = null;
let pending = new Map<string, { resolve: (v: number[][]) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/embedding.worker.ts', import.meta.url));
    worker.addEventListener('message', (event: MessageEvent<EmbedResponse>) => {
      const { id, type, embeddings, error } = event.data;
      const handler = pending.get(id);
      if (!handler) return;
      pending.delete(id);
      if (type === 'embed' && embeddings) {
        handler.resolve(embeddings);
      } else {
        handler.reject(new Error(error || 'Embedding failed'));
      }
    });
  }
  return worker;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Generate 384-dim embeddings for one or more texts.
 * First call loads the model (~1-2s). Subsequent calls are fast.
 */
export async function embed(texts: string[]): Promise<EmbeddingVector[]> {
  if (texts.length === 0) return [];

  const id = makeId();
  const w = getWorker();

  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve: (arrays: number[][]) => {
        resolve(arrays.map((arr) => new Float32Array(arr)));
      },
      reject,
    });
    w.postMessage({ id, type: 'embed', texts } as EmbedMessage);
  });
}

/**
 * Generate a single embedding.
 */
export async function embedOne(text: string): Promise<EmbeddingVector> {
  const results = await embed([text]);
  return results[0];
}

/**
 * Compute cosine similarity between two embeddings.
 */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Terminate the worker (cleanup).
 */
export function terminateEmbeddingWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
    pending.clear();
  }
}
