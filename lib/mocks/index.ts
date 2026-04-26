/**
 * lib/mocks/index.ts
 *
 * Mock API orchestrator for Next.js-only testing.
 *
 * When NEXT_PUBLIC_MOCK_API is set (in .env.local), all DB and AI calls
 * route through this module instead of hitting Tauri/SQLite/llama-server.
 *
 * This is 100% safe — no filesystem writes, no DB connections, no model loading.
 * Just static JavaScript objects returned instantly.
 */

// ─── Environment Detection ───

export const IS_MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_API === 'true';

export function logMockStatus(): void {
  if (IS_MOCK_MODE) {
    console.log(
      '%c[MOCK] API mock mode is ACTIVE — no Tauri/SQLite/LLM calls will be made',
      'color: #059669; font-weight: bold; background: #d1fae5; padding: 2px 6px; border-radius: 4px;'
    );
  }
}

// Re-export everything for convenience
export * from './quran-data';
export * from './hadith-data';
export * from './ai-responses';
