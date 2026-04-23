/**
 * Generation Worker for Hujjah
 *
 * Runs text-generation models via Transformers.js in a Web Worker
 * to avoid blocking the main UI thread.
 */

import { env, pipeline } from '@huggingface/transformers';

env.localModelPath = '/models';
env.allowRemoteModels = false;

let generator: Awaited<ReturnType<typeof pipeline>> | null = null;
let modelLoading = false;

interface GenMessage {
  id: string;
  type: 'generate';
  prompt: string;
  maxNewTokens?: number;
}

interface GenResponse {
  id: string;
  type: 'generate' | 'error' | 'loading';
  text?: string;
  error?: string;
}

async function init() {
  if (generator) return;
  if (modelLoading) {
    while (modelLoading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return;
  }

  modelLoading = true;
  try {
    generator = await pipeline('text-generation', 'qwen-onnx', {
      quantized: true,
    } as Record<string, unknown>);
  } catch (err) {
    console.error('[GenerationWorker] Failed to load model:', err);
    throw err;
  } finally {
    modelLoading = false;
  }
}

self.addEventListener('message', async (event: MessageEvent<GenMessage>) => {
  const { id, type, prompt, maxNewTokens = 120 } = event.data;

  if (type !== 'generate') {
    self.postMessage({ id, type: 'error', error: 'Unknown message type' } as GenResponse);
    return;
  }

  try {
    self.postMessage({ id, type: 'loading' } as GenResponse);
    await init();
    const output = await (generator as (text: string, opts: Record<string, unknown>) => Promise<unknown[]>)(prompt, {
      max_new_tokens: maxNewTokens,
      temperature: 0.1,
      do_sample: false,
      return_full_text: false,
    });

    const text = (output?.[0] as { generated_text?: string })?.generated_text;
    self.postMessage({ id, type: 'generate', text: text?.trim() || '' } as GenResponse);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ id, type: 'error', error: message } as GenResponse);
  }
});
