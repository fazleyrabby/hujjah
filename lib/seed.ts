import { getDatabase } from './db';

// Progress callback type
export type ProgressCallback = (phase: string, current: number, total: number) => void;

interface SeedEntry {
  content: string;
  source_ref: string;
}

export async function seedDatabase(onProgress?: ProgressCallback) {
  const db = await getDatabase();
  
  // 1. Check if knowledge table is empty
  const countRes = await db.query('SELECT count(*) as count FROM knowledge');
  const count = parseInt((countRes.rows[0] as any).count);
  
  if (count > 0) {
    console.log('Database already seeded.');
    return;
  }

  // 2. Fetch seed.json
  const response = await fetch('/data/seed.json');
  if (!response.ok) {
    throw new Error('Could not load knowledge base. Please check your connection and reload.');
  }
  const data: SeedEntry[] = await response.json();
  const total = data.length;

  // 3. Initialize worker for embeddings
  const worker = new Worker(new URL('../workers/embedding.worker.ts', import.meta.url));
  
  return new Promise<void>((resolve, reject) => {
    worker.onmessage = async (event) => {
      const { type, payload } = event.data;

      if (type === 'READY') {
        // Start embedding the first entry or the whole batch
        // For Phase 1, we can do them one by one or in small batches
        worker.postMessage({
          type: 'EMBED',
          payload: { texts: data.map(d => d.content), batchId: 'seed-all' }
        });
      } else if (type === 'PROGRESS') {
        // We can approximate progress based on worker percent if it's processing the batch
        // In this simple version, we'll just report the phase
        if (onProgress) {
          // Worker reports internal percent, we'll map that to our total if needed
        }
      } else if (type === 'EMBEDDING_COMPLETE') {
        const { embeddings } = payload;
        
        // 4. Batch insert into PGlite (batches of 50)
        const batchSize = 50;
        for (let i = 0; i < data.length; i += batchSize) {
          const batchData = data.slice(i, i + batchSize);
          const batchEmbeddings = embeddings.slice(i, i + batchSize);
          
          for (let j = 0; j < batchData.length; j++) {
            await db.query(
              'INSERT INTO knowledge (content, source_ref, category, embedding) VALUES ($1, $2, $3, $4)',
              [
                batchData[j].content,
                batchData[j].source_ref,
                'general',
                `[${batchEmbeddings[j].join(',')}]`
              ]
            );
            
            if (onProgress) {
                onProgress('seeding', i + j + 1, total);
            }
          }
        }

        // 6. Set seeded flag
        localStorage.setItem('hujjah_seeded', 'true');
        worker.terminate();
        resolve();
      } else if (type === 'ERROR') {
        worker.terminate();
        reject(new Error(payload.message));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    worker.postMessage({ type: 'LOAD' });
  });
}
