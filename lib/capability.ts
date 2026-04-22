export type ExecutionMode = 'FULL_LOCAL' | 'HYBRID' | 'LITE';

export interface CapabilityResult {
  mode: ExecutionMode;
  memory: number;
  cores: number;
  gpuOk: boolean;
}

export async function detectCapability(): Promise<CapabilityResult> {
  // Use navigator.deviceMemory if available, default to 2GB for safety
  const memory = (navigator as any).deviceMemory ?? 2;
  const cores = navigator.hardwareConcurrency ?? 2;
  const hasWebGPU = !!(navigator as any).gpu;
  let gpuOk = false;

  if (hasWebGPU) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      gpuOk = adapter !== null;
    } catch (e) {
      gpuOk = false;
    }
  }

  let mode: ExecutionMode = 'LITE';

  if (gpuOk && memory >= 8) {
    mode = 'FULL_LOCAL';
  } else if (memory >= 4) {
    mode = 'HYBRID';
  } else {
    mode = 'LITE';
  }

  return {
    mode,
    memory,
    cores,
    gpuOk
  };
}
