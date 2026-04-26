/**
 * lib/ai/rollout.ts
 *
 * Phase 8: Gradual rollout logging.
 * Tracks inference performance and errors.
 */

interface InferenceMetrics {
  timestamp: number;
  method: 'native' | 'transformers.js' | 'fallback' | 'llama.cpp';
  promptLength: number;
  responseLength: number;
  durationMs: number;
  ramBeforeMb?: number;
  ramAfterMb?: number;
  error?: string;
  modelTier?: string;
}

const METRICS_KEY = 'hujjah-ai-metrics';
const MAX_METRICS = 50;

function getMemoryInfo(): { usedJSHeapSize: number; totalJSHeapSize: number } | null {
  if (typeof performance !== 'undefined' && (performance as any).memory) {
    return (performance as any).memory;
  }
  return null;
}

export function logInferenceStart(method: string, promptLength: number): number {
  console.log(`[Rollout] Inference start: method=${method}, prompt=${promptLength} chars`);
  const mem = getMemoryInfo();
  if (mem) {
    console.log(`[Rollout] RAM before: ${Math.round(mem.usedJSHeapSize / 1048576)}MB`);
  }
  return performance.now();
}

export function logInferenceEnd(
  startTime: number,
  method: 'native' | 'transformers.js' | 'fallback' | 'llama.cpp',
  promptLength: number,
  responseLength: number,
  error?: string,
  modelTier?: string
): void {
  const duration = Math.round(performance.now() - startTime);
  const mem = getMemoryInfo();

  const metric: InferenceMetrics = {
    timestamp: Date.now(),
    method,
    promptLength,
    responseLength,
    durationMs: duration,
    ramBeforeMb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : undefined,
    error,
    modelTier,
  };

  // Store metrics
  try {
    const stored = JSON.parse(localStorage.getItem(METRICS_KEY) || '[]');
    stored.push(metric);
    if (stored.length > MAX_METRICS) stored.shift();
    localStorage.setItem(METRICS_KEY, JSON.stringify(stored));
  } catch {
    // Ignore storage errors
  }

  if (error) {
    console.error(`[Rollout] Inference FAILED: method=${method}, duration=${duration}ms, error=${error}`);
  } else {
    console.log(`[Rollout] Inference SUCCESS: method=${method}, duration=${duration}ms, response=${responseLength} chars`);
  }

  if (mem) {
    console.log(`[Rollout] RAM after: ${Math.round(mem.usedJSHeapSize / 1048576)}MB`);
  }
}

export function getRolloutMetrics(): InferenceMetrics[] {
  try {
    return JSON.parse(localStorage.getItem(METRICS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearRolloutMetrics(): void {
  localStorage.removeItem(METRICS_KEY);
}
