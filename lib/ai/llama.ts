/**
 * lib/ai/llama.ts
 *
 * llama.cpp (GGUF) feature flag and frontend wrapper.
 * Phase 0: Critical safety — default is FALSE.
 */

/**
 * Check if llama.cpp native inference is enabled.
 * Default: false — always falls back to Transformers.js.
 */
export const USE_LLAMA_CPP: boolean =
  process.env.NEXT_PUBLIC_USE_LLAMA_CPP === 'true';

console.log('[AI] llama.cpp enabled:', USE_LLAMA_CPP);

/**
 * Load the GGUF model manually.
 * Call this before first inference to avoid auto-load on startup.
 */
export async function loadLlamaModel(path: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('load_llama_model', { path });
    console.log('[Llama] Model loaded:', path);
  } catch (err) {
    console.error('[Llama] Model load failed:', err);
    throw err;
  }
}

/**
 * Run inference via llama.cpp Rust backend.
 * Called ONLY when NEXT_PUBLIC_USE_LLAMA_CPP=true.
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
 * Wrapper that routes to llama.cpp or Transformers.js based on flag.
 * Safe: if llama.cpp fails or is disabled, falls back immediately.
 */
export async function withLlamaFallback<T>(
  llamaFn: () => Promise<T>,
  jsFn: () => Promise<T>,
  context: string
): Promise<T> {
  if (!USE_LLAMA_CPP) {
    console.log(`[AI] ${context} — using Transformers.js (llama.cpp disabled)`);
    return jsFn();
  }

  try {
    console.log(`[AI] ${context} — attempting llama.cpp inference...`);
    const result = await llamaFn();
    console.log(`[AI] ${context} — llama.cpp succeeded`);
    return result;
  } catch (err) {
    console.warn(`[AI] ${context} — llama.cpp failed, falling back to Transformers.js:`, err);
    return jsFn();
  }
}
