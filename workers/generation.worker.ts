/**
 * Generation Worker for Hujjah
 *
 * Runs text-generation models via Transformers.js in a Web Worker
 * to avoid blocking the main UI thread.
 */

import { env, pipeline } from '@huggingface/transformers';

env.localModelPath = '/models';
env.allowLocalModels = true;
env.allowRemoteModels = false;

const MODEL_PATH = '/models/qwen-onnx';

let generator: Awaited<ReturnType<typeof pipeline>> | null = null;
let modelLoading = false;

interface GenMessage {
  id: string;
  type: 'generate' | 'init';
  prompt?: string;
  maxNewTokens?: number;
}

interface GenResponse {
  id: string;
  type: 'generate' | 'error' | 'loading';
  text?: string;
  error?: string;
}

/**
 * Format prompt for Qwen2.5-Instruct chat template.
 */
function formatChatPrompt(userPrompt: string): string {
  return `<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n`;
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
    console.log('[GenerationWorker] Loading qwen-onnx...');

    generator = await pipeline('text-generation', MODEL_PATH, {
      quantized: true,
      local_files_only: true,
    } as Record<string, unknown>);

    console.log('[GenerationWorker] Model loaded successfully');
  } catch (err) {
    console.error('[GenerationWorker] Failed to load model:', err);
    throw err;
  } finally {
    modelLoading = false;
  }
}

self.addEventListener('message', async (event: MessageEvent<GenMessage>) => {
  const { id, type, prompt, maxNewTokens = 80 } = event.data;

  if (type === 'init') {
    try {
      await init();
      self.postMessage({ id, type: 'generate', text: '' } as GenResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ id, type: 'error', error: message } as GenResponse);
    }
    return;
  }

  if (type !== 'generate') {
    self.postMessage({ id, type: 'error', error: 'Unknown message type' } as GenResponse);
    return;
  }

  try {
    self.postMessage({ id, type: 'loading' } as GenResponse);
    await init();

    const chatPrompt = formatChatPrompt(prompt ?? '');
    console.log('[GenerationWorker] Generating with prompt length:', chatPrompt.length);

    const output = await (generator as (text: string, opts: Record<string, unknown>) => Promise<unknown[]>)(
      chatPrompt,
      {
        max_new_tokens: maxNewTokens,
        temperature: 0.3,
        do_sample: true,
        top_p: 0.9,
        return_full_text: false,
      }
    );

    const text = (output?.[0] as { generated_text?: string })?.generated_text;
    console.log('[GenerationWorker] Generated text length:', text?.length ?? 0);
    self.postMessage({ id, type: 'generate', text: text?.trim() || '' } as GenResponse);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GenerationWorker] Generation error:', message);
    self.postMessage({ id, type: 'error', error: message } as GenResponse);
  }
});
