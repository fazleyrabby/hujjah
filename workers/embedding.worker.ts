/**
 * Embedding Worker for Hujjah
 *
 * Generates 384-dimensional embeddings using the local all-MiniLM-L6-v2 model.
 * Communicates with the main thread via postMessage.
 */

import { env, pipeline } from '@huggingface/transformers';

// Configure local model path (relative to the worker location)
env.localModelPath = '/models';
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
  extractor = await pipeline('feature-extraction', 'all-MiniLM-L6-v2', {
    quantized: true,
  } as Record<string, unknown>);
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
    self.postMessage({ id, type: 'error', error: message } as WorkerResponse);
  }
});
