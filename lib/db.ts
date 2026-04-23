import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';

let dbInstance: PGlite | null = null;
let initPromise: Promise<PGlite> | null = null;

export interface DatabaseStatus {
  status: 'loading' | 'ready' | 'error';
  message?: string;
}

let statusCallback: ((status: DatabaseStatus) => void) | null = null;

export function onDatabaseStatusChange(callback: (status: DatabaseStatus) => void) {
  statusCallback = callback;
}

/**
 * Initialize PGlite with Quran-only schema.
 * Uses IndexedDB (idb://) for browser storage.
 */
export async function getDatabase(): Promise<PGlite> {
  if (dbInstance) {
    try {
      await dbInstance.query('SELECT 1');
      return dbInstance;
    } catch (e) {
      dbInstance = null;
    }
  }

  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (statusCallback) statusCallback({ status: 'loading', message: 'Initializing database...' });

      dbInstance = await PGlite.create({
        dataDir: 'idb://hujjah-minimal',
        relaxedDurability: true,
        extensions: { vector }
      });

      await dbInstance.exec(`
        CREATE EXTENSION IF NOT EXISTS vector;

        CREATE TABLE IF NOT EXISTS knowledge (
          id        SERIAL PRIMARY KEY,
          content   TEXT        NOT NULL,
          surah     INTEGER     NOT NULL,
          ayah      INTEGER     NOT NULL,
          embedding VECTOR(384)
        );

        CREATE INDEX IF NOT EXISTS idx_knowledge_surah_ayah ON knowledge(surah, ayah);
      `);

      if (statusCallback) {
        const result = await dbInstance.query('SELECT count(*) AS count FROM knowledge');
        const count = parseInt((result.rows[0] as { count: string }).count);
        statusCallback({ status: 'ready', message: `${count.toLocaleString()} ayahs loaded` });
      }

      return dbInstance;
    } catch (error) {
      console.error('DB init failed:', error);
      if (statusCallback) statusCallback({ status: 'error', message: error instanceof Error ? error.message : 'DB failed' });
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Vector similarity search — top K closest ayahs.
 */
export async function searchVector(embedding: number[], limit: number = 5) {
  const db = await getDatabase();
  const embeddingStr = `[${embedding.join(',')}]`;

  const result = await db.query(`
    SELECT id, content, surah, ayah,
           1 - (embedding <=> $1::vector) AS similarity
    FROM knowledge
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `, [embeddingStr, limit]);

  return result.rows.map(row => {
    const r = row as { id: number; content: string; surah: number; ayah: number; similarity: number };
    return { id: r.id, content: r.content, surah: r.surah, ayah: r.ayah, similarity: r.similarity };
  });
}

/**
 * Simple text search (ILIKE) for fallback.
 */
export async function searchText(query: string, limit: number = 5) {
  const db = await getDatabase();
  const term = `%${query}%`;

  const result = await db.query(`
    SELECT id, content, surah, ayah
    FROM knowledge
    WHERE content ILIKE $1
    LIMIT $2
  `, [term, limit]);

  return result.rows.map(row => {
    const r = row as { id: number; content: string; surah: number; ayah: number };
    return { id: r.id, content: r.content, surah: r.surah, ayah: r.ayah, similarity: 0 };
  });
}

/**
 * Get total ayah count.
 */
export async function getAyahCount(): Promise<number> {
  const db = await getDatabase();
  const res = await db.query('SELECT count(*) AS count FROM knowledge');
  return parseInt((res.rows[0] as { count: string }).count);
}

/**
 * Reset database (drop & recreate schema).
 */
export async function resetDatabase() {
  const db = await getDatabase();
  await db.exec(`
    DROP TABLE IF EXISTS knowledge CASCADE;
    CREATE TABLE knowledge (
      id        SERIAL PRIMARY KEY,
      content   TEXT        NOT NULL,
      surah     INTEGER     NOT NULL,
      ayah      INTEGER     NOT NULL,
      embedding VECTOR(384)
    );
    CREATE INDEX idx_knowledge_surah_ayah ON knowledge(surah, ayah);
  `);
}
