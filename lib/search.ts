import { getDatabase } from './db';

export interface SearchResult {
  content: string;
  source_ref: string;
  distance: number;
}

export async function semanticSearch(userQuery: string, limit = 3): Promise<SearchResult[]> {
  // 1. Embed user query using worker
  // In a real app, you might want to reuse a worker instance
  const worker = new Worker(new URL('../workers/embedding.worker.ts', import.meta.url));
  
  const queryEmbedding = await new Promise<number[]>((resolve, reject) => {
    worker.onmessage = (event) => {
      const { type, payload } = event.data;
      if (type === 'READY') {
        worker.postMessage({ type: 'EMBED', payload: { texts: [userQuery] } });
      } else if (type === 'EMBEDDING_COMPLETE') {
        resolve(payload.embeddings[0]);
        worker.terminate();
      } else if (type === 'ERROR') {
        reject(new Error(payload.message));
        worker.terminate();
      }
    };
    worker.postMessage({ type: 'LOAD' });
  });

  // 2. Query PGlite using cosine distance (<=>)
  const db = await getDatabase();
  const results = await db.query(`
    SELECT content, source_ref, embedding <=> $1::vector AS distance
    FROM knowledge
    ORDER BY distance ASC
    LIMIT $2
  `, [JSON.stringify(queryEmbedding), limit]);

  return results.rows as unknown as SearchResult[];
}
