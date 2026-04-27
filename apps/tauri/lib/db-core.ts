/**
 * lib/db-core.ts
 *
 * Core DB singleton and types — extracted to avoid circular deps
 * with AI modules (e.g., retrieve.ts → db.ts → retrieve.ts).
 */

import { IS_MOCK_MODE } from './mocks';

export interface QueryResult {
  rowsAffected: number;
  lastInsertId: number;
}

export interface DBLike {
  select: <T>(sql: string, bindValues?: unknown[]) => Promise<T>;
  execute: (sql: string, bindValues?: unknown[]) => Promise<QueryResult>;
}

// ─── Singleton ───
let dbPromise: Promise<DBLike> | null = null;

export async function getDB(): Promise<DBLike> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    try {
      const mod = await import('@tauri-apps/plugin-sql');
      const Database = mod.default;
      const db = await Database.load('sqlite:hujjah-quran.db');
      return db as DBLike;
    } catch (err) {
      console.warn('[DB] Tauri SQL plugin unavailable — using mock DB', err);
      return createMockDB();
    }
  })();

  return dbPromise;
}

function createMockDB(): DBLike {
  return {
    select: async <T>() => [] as unknown as T,
    execute: async () => ({ rowsAffected: 0, lastInsertId: 0 }),
  };
}
