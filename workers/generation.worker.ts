/**
 * Generation Worker for Hujjah
 *
 * Runs text-generation models via Transformers.js in a Web Worker
 * to avoid blocking the main UI thread.
 */

import { env, pipeline } from '@huggingface/transformers';

// NOTE: Keep in sync with lib/ai/model-config.ts
const GENERATION_MODEL = 'qwen2.5-1.5b';
const MODEL_PATH = `/models/${GENERATION_MODEL}`;

// Detect model capability tier from model name.
function detectModelTier(modelName: string): '0.5B' | '1.5B' | 'unknown' {
  if (/0\.5[Bb]|500[Mm]|qwen-onnx/.test(modelName)) return '0.5B';
  if (/1\.5[Bb]|1500[Mm]/.test(modelName)) return '1.5B';
  return 'unknown';
}

const MODEL_TIER = detectModelTier(GENERATION_MODEL);
const MAX_TOKENS_BY_TIER: Record<string, number> = {
  '0.5B': 80,
  '1.5B': 150,
  unknown: 150,
};

env.localModelPath = '/models';
env.allowLocalModels = true;
env.allowRemoteModels = false;

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
    console.log(`[GenerationWorker] Loading ${GENERATION_MODEL}...`);

    generator = await pipeline('text-generation', MODEL_PATH, {
      quantized: true,
      local_files_only: true,
    } as Record<string, unknown>);

    console.log(`[GenerationWorker] ${GENERATION_MODEL} loaded (tier: ${MODEL_TIER})`);
  } catch (err) {
    console.error('[GenerationWorker] Failed to load model:', err);
    throw err;
  } finally {
    modelLoading = false;
  }
}

self.addEventListener('message', async (event: MessageEvent<GenMessage>) => {
  const { id, type, prompt } = event.data;
  const tierMax = MAX_TOKENS_BY_TIER[MODEL_TIER] ?? 150;
  const maxNewTokens = Math.min(event.data.maxNewTokens ?? tierMax, tierMax);

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

    const output = await (generator as (text: string, opts: Record<string, unknown>) => Promise<unknown[]>) (
      chatPrompt,
      {
        max_new_tokens: maxNewTokens,
        temperature: MODEL_TIER === '0.5B' ? 0 : 0.3,
        do_sample: MODEL_TIER !== '0.5B',
        top_p: MODEL_TIER === '0.5B' ? 1.0 : 0.9,
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