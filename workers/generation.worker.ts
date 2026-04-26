/**
 * Generation Worker for Hujjah
 *
 * NOTE: Generation has moved to the llama.cpp Rust backend.
 * This worker is kept for compatibility but will return an error
 * if invoked, since no local ONNX generation models are bundled.
 */

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

const ERROR_MESSAGE =
  'ONNX generation models have been removed. ' +
  'Please ensure llama.cpp backend is enabled and llama-cli is installed. ' +
  'See Settings > AI Model for details.';

self.addEventListener('message', (event: MessageEvent<GenMessage>) => {
  const { id, type } = event.data;

  if (type === 'init') {
    self.postMessage({ id, type: 'error', error: ERROR_MESSAGE } as GenResponse);
    return;
  }

  if (type === 'generate') {
    self.postMessage({ id, type: 'error', error: ERROR_MESSAGE } as GenResponse);
    return;
  }

  self.postMessage({ id, type: 'error', error: 'Unknown message type' } as GenResponse);
});
