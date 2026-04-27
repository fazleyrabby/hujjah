/**
 * lib/ai/native.ts
 *
 * Feature flag for native AI inference.
 * Phase 3: Critical safety — default is FALSE.
 */

/**
 * Check if native AI (Rust backend) is enabled.
 * Default: false — always falls back to Transformers.js.
 */
export const USE_NATIVE_AI: boolean =
  process.env.NEXT_PUBLIC_USE_NATIVE_AI === 'true';

console.log('[AI] Native AI enabled:', USE_NATIVE_AI);

/**
 * Wrapper that routes to native or Transformers.js based on flag.
 * Safe: if native fails or is disabled, falls back immediately.
 */
export async function withNativeFallback<T>(
  nativeFn: () => Promise<T>,
  jsFn: () => Promise<T>,
  context: string
): Promise<T> {
  if (!USE_NATIVE_AI) {
    console.log(`[AI] ${context} — using Transformers.js (native disabled)`);
    return jsFn();
  }

  try {
    console.log(`[AI] ${context} — attempting native inference...`);
    const result = await nativeFn();
    console.log(`[AI] ${context} — native succeeded`);
    return result;
  } catch (err) {
    console.warn(`[AI] ${context} — native failed, falling back to Transformers.js:`, err);
    return jsFn();
  }
}
