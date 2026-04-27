/**
 * AI Model Initialization for Hujjah
 *
 * Configures Transformers.js to load models from Tauri resource directory.
 * Implements WebGPU detection with WASM fallback.
 */

import { env, pipeline } from '@huggingface/transformers';

let modelPathSet = false;
let modelStatus: 'loading' | 'ready' | 'error' | 'unsupported' = 'loading';

/**
 * Initialize the AI model environment for offline use.
 * Call this once at app startup.
 */
export async function initAIEnvironment(): Promise<void> {
  try {
    // In a Tauri app, models are bundled in src-tauri/resources/models
    // At runtime, we use the resource path via Tauri APIs.
    // For development/build, we use a relative path.
    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__ !== undefined;

    if (isTauri) {
      try {
        const { resourceDir } = await import('@tauri-apps/api/path');
        const resDir = await resourceDir();
        env.localModelPath = `${resDir}/models`;
      } catch {
        // Fallback for dev builds
        env.localModelPath = './src-tauri/resources/models';
      }
    } else {
      env.localModelPath = './src-tauri/resources/models';
    }

    env.allowRemoteModels = false;
    modelPathSet = true;

    // Detect WebGPU support
    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
    if (!hasWebGPU) {
      console.log('[AI] WebGPU not available, using WASM fallback');
    } else {
      console.log('[AI] WebGPU detected');
    }

    modelStatus = 'ready';
  } catch (err) {
    console.error('[AI] Initialization failed:', err);
    modelStatus = 'error';
  }
}

/**
 * Get the current model loading status.
 */
export function getModelStatus(): 'loading' | 'ready' | 'error' | 'unsupported' {
  return modelStatus;
}

/**
 * Get a human-readable model status label.
 */
export function getModelStatusLabel(): string {
  switch (modelStatus) {
    case 'loading':
      return 'Loading...';
    case 'ready':
      return 'Offline (Bundled)';
    case 'error':
      return 'Error';
    case 'unsupported':
      return 'Unsupported';
    default:
      return 'Unknown';
  }
}

/**
 * Create a feature-extraction pipeline for embeddings.
 */
export async function createEmbeddingPipeline() {
  if (!modelPathSet) {
    await initAIEnvironment();
  }

  return pipeline('feature-extraction', 'bge-m3', {
    quantized: true,
  } as any);
}
