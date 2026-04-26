/**
 * lib/ai/llama.ts
 *
 * llama.cpp (GGUF) frontend wrapper.
 * Supports tiered model selection (mobile vs desktop).
 */

export const USE_LLAMA_CPP: boolean =
  process.env.NEXT_PUBLIC_USE_LLAMA_CPP !== 'false';

// Tiered model paths
export const MODEL_PATH_MOBILE: string =
  process.env.NEXT_PUBLIC_LLAMA_MODEL_PATH_MOBILE ||
  'resources/models/qwen-0.5b-q4/qwen2.5-0.5b-instruct-q4_k_m.gguf';

export const MODEL_PATH_DESKTOP: string =
  process.env.NEXT_PUBLIC_LLAMA_MODEL_PATH_DESKTOP ||
  'resources/models/qwen-1.5b-q4/qwen2.5-1.5b-instruct-q4_k_m.gguf';

export const DEFAULT_LLAMA_MODEL_PATH: string =
  process.env.NEXT_PUBLIC_LLAMA_MODEL_PATH || MODEL_PATH_DESKTOP;

console.log('[AI] llama.cpp enabled:', USE_LLAMA_CPP);
console.log('[AI] llama.cpp mobile path:', MODEL_PATH_MOBILE);
console.log('[AI] llama.cpp desktop path:', MODEL_PATH_DESKTOP);

/**
 * Detect device tier from Rust backend.
 */
export async function detectDeviceTier(): Promise<'mobile' | 'desktop'> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const tier = await invoke<string>('get_device_tier');
    return tier as 'mobile' | 'desktop';
  } catch {
    // Fallback: detect via navigator.deviceMemory
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (mem !== undefined && mem < 4) return 'mobile';
    return 'desktop';
  }
}

/**
 * Get the appropriate model path for the current device tier.
 */
export async function getTieredModelPath(): Promise<string> {
  const tier = await detectDeviceTier();
  return tier === 'mobile' ? MODEL_PATH_MOBILE : MODEL_PATH_DESKTOP;
}

/**
 * Load the GGUF model manually.
 * Call this before first inference to avoid auto-load on startup.
 * If no path provided, auto-detects based on device tier.
 */
export async function loadLlamaModel(path?: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const modelPath = path || (await getTieredModelPath());
    await invoke('load_llama_model', { path: modelPath });
    console.log('[Llama] Model loaded:', modelPath);
  } catch (err) {
    console.error('[Llama] Model load failed:', err);
    throw err;
  }
}

/**
 * Run inference via llama.cpp Rust backend.
 */
export async function runLlamaInference(prompt: string): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const response = await invoke<string>('run_llama', { prompt });
    return response;
  } catch (err) {
    console.warn('[Llama] Inference failed:', err);
    throw err;
  }
}

/**
 * Wrapper that routes to llama.cpp or throws if disabled.
 * The Transformers.js fallback has been removed — llama.cpp is the sole backend.
 */
export async function withLlamaFallback<T>(
  llamaFn: () => Promise<T>,
  _jsFn: () => Promise<T>,  // kept for API compat, but unused
  context: string
): Promise<T> {
  if (!USE_LLAMA_CPP) {
    throw new Error(`llama.cpp is disabled. Enable it in Settings to use ${context}.`);
  }

  console.log(`[AI] ${context} — attempting llama.cpp inference...`);
  const result = await llamaFn();
  console.log(`[AI] ${context} — llama.cpp succeeded`);
  return result;
}
