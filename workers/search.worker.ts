import { pipeline, env } from '@huggingface/transformers';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';

// Config
(env.backends as any).onnx.wasm.proxy = false;
env.allowLocalModels = false;
env.useBrowserCache = true;

let embedder: any = null;
let db: PGlite | null = null;

interface SearchResult {
  id: number;
  content: string;
  surah: number;
  ayah: number;
  similarity: number;
}

async function init() {
  if (!db) {
    db = await PGlite.create({
      dataDir: 'idb://hujjah-minimal',
      relaxedDurability: true,
      extensions: { vector }
    });
  }

  if (!embedder) {
    self.postMessage({ type: 'STATUS', payload: 'Loading embedding model...' });
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      device: 'webgpu',
      progress_callback: (data: any) => {
        if (data.status === 'progress') {
          self.postMessage({
            type: 'STATUS',
            payload: `Loading model... ${Math.round(data.progress)}%`
          });
        }
      }
    });
  }

  self.postMessage({ type: 'READY' });
}

async function search(query: string): Promise<SearchResult[]> {
  if (!embedder || !db) throw new Error('Not initialized');

  // Embed query
  self.postMessage({ type: 'STATUS', payload: 'Embedding query...' });
  const output = await embedder(query, { pooling: 'mean', normalize: true });
  const embedding = Array.from(output.data as Float32Array);
  const embStr = `[${embedding.join(',')}]`;

  // Vector search
  self.postMessage({ type: 'STATUS', payload: 'Searching...' });
  const result = await db.query(`
    SELECT id, content, surah, ayah,
           1 - (embedding <=> $1::vector) AS similarity
    FROM knowledge
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT 5
  `, [embStr]);

  return result.rows.map(row => {
    const r = row as { id: number; content: string; surah: number; ayah: number; similarity: number };
    return { id: r.id, content: r.content, surah: r.surah, ayah: r.ayah, similarity: r.similarity };
  });
}

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case 'INIT':
        await init();
        break;

      case 'SEARCH': {
        const results = await search(payload.query);
        self.postMessage({ type: 'RESULTS', payload: { results, query: payload.query } });
        break;
      }

      default:
        console.warn('Unknown message type:', type);
    }
  } catch (error: any) {
    self.postMessage({ type: 'ERROR', payload: error.message });
  }
};
