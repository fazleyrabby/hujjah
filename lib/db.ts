import { PGLite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';

let dbInstance: PGLite | null = null;

export async function getDatabase() {
  if (dbInstance) return dbInstance;

  dbInstance = await PGLite.create({
    dataDir: 'idb://hujjah-vault',
    relaxedDurability: true,
    extensions: {
      vector
    }
  });

  // Initialize schema
  await dbInstance.exec(`
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS knowledge (
      id          SERIAL PRIMARY KEY,
      content     TEXT        NOT NULL,
      source_ref  TEXT        NOT NULL,
      category    TEXT        NOT NULL,
      embedding   VECTOR(384) NOT NULL,
      created_at  TIMESTAMP   DEFAULT NOW()
    );
  `);

  return dbInstance;
}
