/**
 * lib/ai/model-config.ts
 *
 * Central configuration for AI/ML models.
 * Change these paths to switch embedding or generation models.
 */

// ─── Embedding Model ───
// Uses BGE-M3 for multilingual embeddings (Arabic/Bengali/English)
export const EMBEDDING_MODEL = 'bge-m3' as const;
export const EMBEDDING_DIM = 1024;

// ─── Generation Model ───
// Options:
//   'qwen-0.5b-q4'   → Qwen2.5-0.5B Q4_K_M, ~350MB, mobile-friendly
//   'qwen-1.5b-q4'   → Qwen2.5-1.5B Q4_K_M, ~1.0GB, desktop quality
export const GENERATION_MODEL = 'qwen-1.5b-q4' as const;

// ─── Model base path (relative to public/models symlink) ───
export const MODEL_BASE_PATH = '/models';

export function getEmbeddingModelPath(): string {
  return `${MODEL_BASE_PATH}/${EMBEDDING_MODEL}`;
}

export function getGenerationModelPath(): string {
  return `${MODEL_BASE_PATH}/${GENERATION_MODEL}`;
}