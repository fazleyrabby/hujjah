import { pipeline, env } from '@huggingface/transformers';

// Configuration for local-first/browser environment
env.allowLocalModels = false;
env.useBrowserCache = true;
// WebGPU is preferred in Transformers.js v3
env.backends.onnx.wasm.proxy = false; 

let embeddingPipeline: any = null;

async function loadModel() {
  if (embeddingPipeline) return;

  try {
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      device: 'webgpu',
      progress_callback: (data: any) => {
        if (data.status === 'progress') {
          self.postMessage({
            type: 'PROGRESS',
            payload: { phase: 'Loading model...', percent: data.progress }
          });
        }
      }
    });

    self.postMessage({ type: 'READY' });
  } catch (error: any) {
    self.postMessage({
      type: 'ERROR',
      payload: { message: error.message, code: 'MODEL_LOAD_FAILED' }
    });
  }
}

async function embed(texts: string[], batchId?: string) {
  if (!embeddingPipeline) {
    await loadModel();
  }

  try {
    const embeddings = [];
    for (let i = 0; i < texts.length; i++) {
        const output = await embeddingPipeline(texts[i], {
            pooling: 'mean',
            normalize: true,
        });
        embeddings.push(Array.from(output.data));
        
        self.postMessage({
            type: 'PROGRESS',
            payload: { 
                phase: 'Generating embeddings...', 
                percent: Math.round(((i + 1) / texts.length) * 100) 
            }
        });
    }

    self.postMessage({
      type: 'EMBEDDING_COMPLETE',
      payload: { embeddings, batchId }
    });
  } catch (error: any) {
    self.postMessage({
      type: 'ERROR',
      payload: { message: error.message, code: 'EMBEDDING_FAILED' }
    });
  }
}

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'LOAD':
      await loadModel();
      break;
    case 'EMBED':
      await embed(payload.texts, payload.batchId);
      break;
    default:
      console.warn('Unknown message type in embedding worker:', type);
  }
};
