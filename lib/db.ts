import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';

let dbInstance: PGlite | null = null;
let isInitializing = false;
let initPromise: Promise<PGlite> | null = null;

export interface DatabaseStatus {
  status: 'loading' | 'copying' | 'ready' | 'error';
  progress?: number;
  message?: string;
}

let statusCallback: ((status: DatabaseStatus) => void) | null = null;

export function onDatabaseStatusChange(callback: (status: DatabaseStatus) => void) {
  statusCallback = callback;
}

/**
 * Initialize database
 */
export async function getDatabase(): Promise<PGlite> {
  // Return existing instance if available and open
  if (dbInstance) {
    try {
      // Test if connection is still alive
      await dbInstance.query('SELECT 1');
      return dbInstance;
    } catch (e) {
      // Connection is closing/closed, will reinitialize
      console.log('Database connection lost, reinitializing...');
      dbInstance = null;
    }
  }

  // Return existing initialization promise if in progress
  if (initPromise) {
    return initPromise;
  }

  isInitializing = true;

  initPromise = (async () => {
    try {
      if (statusCallback) {
        statusCallback({ status: 'loading', message: 'Initializing database...' });
      }

      // NOTE: PGlite 0.4.4 does not support opfs:// protocol.
      // Use idb:// (IndexedDB) for browser storage.
      // For 1M+ records, consider upgrading to PGlite 0.2.x+ which has OPFS support.
      dbInstance = await PGlite.create({
        dataDir: 'idb://hujjah-vault',
        relaxedDurability: true,
        extensions: { vector }
      });

      // Ensure schema exists
      await dbInstance.exec(`
        CREATE EXTENSION IF NOT EXISTS vector;
        
        CREATE TABLE IF NOT EXISTS knowledge (
          id          SERIAL PRIMARY KEY,
          content     TEXT        NOT NULL,
          source_ref  TEXT        NOT NULL,
          category    TEXT        NOT NULL,
          embedding   VECTOR(384),
          created_at  TIMESTAMP   DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category);
      `);

      if (statusCallback) {
        try {
          const result = await dbInstance.query('SELECT count(*) AS count FROM knowledge');
          const count = parseInt((result.rows[0] as { count: string }).count);
          statusCallback({ 
            status: 'ready', 
            message: `Database ready (${count.toLocaleString()} records)` 
          });
        } catch (e) {
          statusCallback({ status: 'ready', message: 'Database ready' });
        }
      }

      return dbInstance;
    } catch (error) {
      console.error('Database initialization failed:', error);
      if (statusCallback) {
        statusCallback({ 
          status: 'error', 
          message: error instanceof Error ? error.message : 'Database failed to initialize' 
        });
      }
      throw error;
    } finally {
      isInitializing = false;
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Simple search - fallback for when FTS isn't available
 */
export async function searchSimple(query: string, limit: number = 20) {
  const db = await getDatabase();
  
  // Use ILIKE for simple text search
  const searchTerm = `%${query}%`;
  
  const result = await db.query(`
    SELECT id, content, source_ref, category
    FROM knowledge
    WHERE content ILIKE $1
    LIMIT $2
  `, [searchTerm, limit]);
  
  return result.rows.map(row => {
    const r = row as { id: number; content: string; source_ref: string; category: string };
    return {
      id: r.id,
      content: r.content,
      source_ref: r.source_ref,
      category: r.category
    };
  });
}

/**
 * Vector similarity search (for RAG)
 */
export async function searchVector(embedding: number[], limit: number = 10) {
  const db = await getDatabase();
  
  const embeddingStr = `[${embedding.join(',')}]`;
  
  const result = await db.query(`
    SELECT id, content, source_ref, category,
           1 - (embedding <=> $1::vector) AS similarity
    FROM knowledge
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `, [embeddingStr, limit]);
  
  return result.rows.map(row => {
    const r = row as { id: number; content: string; source_ref: string; category: string; similarity: number };
    return {
      id: r.id,
      content: r.content,
      source_ref: r.source_ref,
      category: r.category,
      similarity: r.similarity
    };
  });
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  const db = await getDatabase();
  
  const total = await db.query('SELECT count(*) AS count FROM knowledge');
  const byCategory = await db.query(`
    SELECT category, count(*) AS count 
    FROM knowledge 
    GROUP BY category 
    ORDER BY count DESC
  `);
  
  return {
    total: parseInt((total.rows[0] as { count: string }).count),
    byCategory: byCategory.rows.map(r => ({
      category: (r as { category: string }).category,
      count: parseInt((r as { count: string }).count)
    }))
  };
}

/**
 * Check if database has pre-seeded data
 */
export async function isPreSeeded(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const result = await db.query('SELECT count(*) AS count FROM knowledge');
    const count = parseInt((result.rows[0] as { count: string }).count);
    return count > 10000; // Assume pre-seeded if > 10k records
  } catch {
    return false;
  }
}
