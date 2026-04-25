/**
 * Embedding Worker for Hujjah
 *
 * Generates embeddings using the configured local model.
 * Communicates with the main thread via postMessage.
 */

import { env, pipeline } from '@huggingface/transformers';

// NOTE: Keep in sync with lib/ai/model-config.ts
const EMBEDDING_MODEL = 'all-MiniLM-L6-v2';

// Configure local model path (relative to the worker location)
env.localModelPath = '/models';
env.allowLocalModels = true;
env.allowRemoteModels = false;

let extractor: Awaited<ReturnType<typeof pipeline>> | null = null;

interface WorkerMessage {
  id: string;
  type: 'embed';
  texts: string[];
}

interface WorkerResponse {
  id: string;
  type: 'embed' | 'error';
  embeddings?: number[][];
  error?: string;
}

async function init() {
  if (!extractor) {
    console.log(`[EmbeddingWorker] Loading ${EMBEDDING_MODEL}...`);
    extractor = await pipeline('feature-extraction', `/models/${EMBEDDING_MODEL}`, {
      quantized: true,
      local_files_only: true,
    } as Record<string, unknown>);
    console.log(`[EmbeddingWorker] ${EMBEDDING_MODEL} loaded`);
  }
}

self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, texts } = event.data;

  if (type !== 'embed') {
    self.postMessage({ id, type: 'error', error: 'Unknown message type' } as WorkerResponse);
    return;
  }

  try {
    await init();
    const outputs = await (extractor as any)(texts, { pooling: 'mean', normalize: true });
    const embeddings: number[][] = outputs.tolist();

    self.postMessage({ id, type: 'embed', embeddings } as WorkerResponse);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[EmbeddingWorker] Error:', message);
    self.postMessage({ id, type: 'error', error: message } as WorkerResponse);
  }
});