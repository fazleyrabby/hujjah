import { pipeline, env, TextStreamer } from '@huggingface/transformers';

// Configuration
env.allowLocalModels = false;
env.useBrowserCache = true;
(env.backends as any).onnx.wasm.proxy = false;

let generator: any = null;

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === 'LOAD') {
    try {
      generator = await pipeline('text-generation', 'Xenova/Qwen1.5-0.5B-Chat', {
        device: 'webgpu',
        progress_callback: (data: any) => {
          self.postMessage({ type: 'PROGRESS', payload: data });
        }
      });
      self.postMessage({ type: 'READY' });
    } catch (err: any) {
      console.error('LLM Worker failed to load:', err);
      // Fallback to CPU if WebGPU fails
      try {
        generator = await pipeline('text-generation', 'Xenova/Qwen1.5-0.5B-Chat');
        self.postMessage({ type: 'READY' });
      } catch (e: any) {
        self.postMessage({ type: 'ERROR', payload: { message: err.message } });
      }
    }
  }

  if (type === 'GENERATE') {
    if (!generator) {
      self.postMessage({ type: 'ERROR', payload: { message: 'Generator not loaded' } });
      return;
    }

    const { prompt } = payload;

    try {
      const output = await generator(prompt, {
          max_new_tokens: 256,
          temperature: 0.7,
          do_sample: true,
          top_p: 0.9,
          callback_function: (beams: any) => {
             // Basic streaming support if available in the pipeline version
             const decoded = generator.tokenizer.decode(beams[0].output_token_ids, { skip_special_tokens: true });
             self.postMessage({ type: 'TOKEN', payload: { token: decoded } });
          }
      });

      const response = output[0].generated_text.replace(prompt, '').trim();
      self.postMessage({ type: 'COMPLETE', payload: { response } });
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', payload: { message: err.message } });
    }
  }
};
