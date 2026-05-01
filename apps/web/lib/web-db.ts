/**
 * apps/web/lib/web-db.ts
 *
 * better-sqlite3 adapter implementing the same DBLike interface used by
 * the Tauri app's tauri-plugin-sql. Synchronous SQLite wrapped as async
 * so query functions can stay identical in signature.
 *
 * Singletons per Node.js process — opened once, readonly.
 */

import Database from 'better-sqlite3';
import path from 'path';

interface DBLike {
  select: <T>(sql: string, bindValues?: unknown[]) => Promise<T>;
  execute: (sql: string, bindValues?: unknown[]) => Promise<{ rowsAffected: number; lastInsertId: number }>;
}

function makeAdapter(file: string): DBLike {
  const dataDir = process.env.DB_DATA_DIR ?? './data';
  const dir = path.isAbsolute(dataDir)
    ? dataDir
    : path.join(process.cwd(), dataDir);
  const db = new Database(path.join(dir, file), { readonly: true, fileMustExist: true });
  // Enable WAL for better read concurrency
  db.pragma('journal_mode = WAL');
  return {
    select: async <T>(sql: string, vals: unknown[] = []) =>
      db.prepare(sql).all(...(vals as any[])) as unknown as T,
    execute: async (sql: string, vals: unknown[] = []) => {
      const r = db.prepare(sql).run(...(vals as any[]));
      return { rowsAffected: r.changes, lastInsertId: Number(r.lastInsertRowid) };
    },
  };
}

let quranDb: DBLike | null = null;
let hadithDb: DBLike | null = null;
let quranHealthy = false;
let hadithHealthy = false;

export function getWebQuranDB(): DBLike {
  if (quranDb) return quranDb;
  try {
    quranDb = makeAdapter('hujjah-quran.db');
    quranHealthy = true;
    return quranDb;
  } catch {
    quranHealthy = false;
    return makeFailingDb('Quran database unavailable');
  }
}

export function getWebHadithDB(): DBLike {
  if (hadithDb) return hadithDb;
  try {
    hadithDb = makeAdapter('hujjah-hadith-core.db');
    hadithHealthy = true;
    return hadithDb;
  } catch {
    hadithHealthy = false;
    return makeFailingDb('Hadith database unavailable');
  }
}

function makeFailingDb(msg: string): DBLike {
  return {
    select: async () => { throw new Error(msg); },
    execute: async () => { throw new Error(msg); },
  };
}

export function isQuranHealthy() { return quranHealthy; }
export function isHadithHealthy() { return hadithHealthy; }
