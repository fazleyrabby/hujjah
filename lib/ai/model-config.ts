/**
 * lib/ai/model-config.ts
 *
 * Central configuration for AI/ML models.
 * Change these paths to switch embedding or generation models.
 */

// ─── Embedding Model ───
// Options:
//   'all-MiniLM-L6-v2'  → 384-dim, ~23MB, fast, English-centric
//   'bge-m3'            → 1024-dim, ~550MB, multilingual (Arabic/Bengali/English)
export const EMBEDDING_MODEL = 'all-MiniLM-L6-v2' as const;
export const EMBEDDING_DIM = 384;

// ─── Generation Model ───
// Options:
//   'qwen-onnx'           → Qwen2.5-0.5B, ~512MB, fast, basic quality
//   'qwen2.5-1.5b'        → Qwen2.5-1.5B-Instruct Q4F16, ~1.2GB, much better quality
export const GENERATION_MODEL = 'qwen-onnx' as const;

// ─── Model base path (relative to public/models symlink) ───
export const MODEL_BASE_PATH = '/models';

export function getEmbeddingModelPath(): string {
  return `${MODEL_BASE_PATH}/${EMBEDDING_MODEL}`;
}

export function getGenerationModelPath(): string {
  return `${MODEL_BASE_PATH}/${GENERATION_MODEL}`;
}