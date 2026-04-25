/**
 * lib/ai/cleanup.ts
 *
 * Phase 9: Cleanup utilities.
 * WARNING: Only run after full validation of native AI.
 * Currently stubs — does NOT remove Transformers.js.
 */

/**
 * Check if native AI is stable enough to remove Transformers.js fallback.
 * Returns false until validation passes.
 */
export function isNativeAiValidated(): boolean {
  // TODO: Enable after 30 days of crash-free usage
  // TODO: Check rollout metrics for >99% success rate
  // TODO: Verify all platforms (macOS, Windows, Linux, Android, iOS)
  return false;
}

/**
 * Report cleanup readiness.
 * Logs what would be removed, but does not remove anything.
 */
export function reportCleanupReadiness(): void {
  if (!isNativeAiValidated()) {
    console.log('[Cleanup] Native AI not yet validated. Keeping Transformers.js fallback.');
    console.log('[Cleanup] Validation checklist:');
    console.log('  - 30 days crash-free usage');
    console.log('  - >99% inference success rate');
    console.log('  - All platforms tested');
    console.log('  - Thermal throttling verified');
    return;
  }

  console.log('[Cleanup] Native AI validated. Ready for cleanup:');
  console.log('  - Remove workers/embedding.worker.ts');
  console.log('  - Remove workers/generation.worker.ts');
  console.log('  - Remove lib/ai/explain.ts fallback paths');
  console.log('  - Remove @huggingface/transformers dependency');
  console.log('  - Remove public/models symlink');
}

/**
 * Stub: Will eventually remove Transformers.js artifacts.
 * NEVER call this without explicit user confirmation.
 */
export async function executeCleanup(): Promise<void> {
  console.error('[Cleanup] BLOCKED: Manual confirmation required.');
  console.error('[Cleanup] This will permanently remove Transformers.js fallback.');
  console.error('[Cleanup] Only run after validating native AI on all platforms.');
}
