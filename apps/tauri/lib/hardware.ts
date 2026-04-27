/**
 * lib/hardware.ts
 *
 * Frontend wrapper for hardware profiling.
 * Phase 1: Non-breaking, logs only.
 */

export interface HardwareProfile {
  total_ram_gb: number;
  available_ram_gb: number;
  platform: string;
  is_apple_silicon: boolean;
  has_coreml: boolean;
  has_nnapi: boolean;
}

/**
 * Fetch hardware profile from Rust backend.
 * Safe: read-only, no side effects.
 */
export async function getHardwareProfile(): Promise<HardwareProfile | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const profile = await invoke<HardwareProfile>('hardware_profile_cmd');
    console.log('[Hardware] Profile:', profile);
    return profile;
  } catch (err) {
    console.warn('[Hardware] Failed to get profile:', err);
    return null;
  }
}

/**
 * Log hardware profile on app startup.
 * Non-breaking: never throws.
 */
export async function logHardwareProfile(): Promise<void> {
  const profile = await getHardwareProfile();
  if (profile) {
    console.log('[Hardware] Total RAM:', profile.total_ram_gb, 'GB');
    console.log('[Hardware] Available RAM:', profile.available_ram_gb, 'GB');
    console.log('[Hardware] Platform:', profile.platform);
    console.log('[Hardware] Apple Silicon:', profile.is_apple_silicon);
    console.log('[Hardware] CoreML:', profile.has_coreml);
    console.log('[Hardware] NNAPI:', profile.has_nnapi);

    // Phase 2: Log selected tier (isolated, no action)
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const tier = await invoke<string>('select_model_tier_cmd', { profile });
      console.log('[ModelSelector] Selected tier:', tier);
    } catch (err) {
      console.warn('[ModelSelector] Failed to select tier:', err);
    }
  }
}
