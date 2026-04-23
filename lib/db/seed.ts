import { pipeline } from '@huggingface/transformers';
import { getDatabase } from '../db';

const BATCH_SIZE = 50;

export interface SeedProgress {
  phase: 'parsing' | 'embedding' | 'inserting' | 'complete';
  current: number;
  total: number;
  message: string;
}

export type ProgressCallback = (p: SeedProgress) => void;

interface QuranAyah {
  content: string;
  surah: number;
  ayah: number;
}

/**
 * Parse quran-uthmani.sql into structured ayahs.
 */
function parseQuranSQL(sqlText: string): QuranAyah[] {
  const ayahs: QuranAyah[] = [];
  const lines = sqlText.split('\n');

  for (const line of lines) {
    // Match: (index, sura, aya, 'text'),
    const match = line.match(/^\s*\(\d+,\s*(\d+),\s*(\d+),\s*'((?:[^']|'')*)'\),?\s*$/);
    if (match) {
      ayahs.push({
        surah: parseInt(match[1]),
        ayah: parseInt(match[2]),
        content: match[3].replace(/''/g, "'"),
      });
    }
  }

  return ayahs;
}

/**
 * Seed Quran ayahs into PGlite with embeddings.
 * Call this from a user gesture (e.g. button click).
 */
export async function seedQuran(
  sqlFile: File,
  onProgress?: ProgressCallback
) {
  const db = await getDatabase();

  // 1. Parse
  onProgress?.({ phase: 'parsing', current: 0, total: 0, message: 'Parsing Quran SQL...' });
  const sqlText = await sqlFile.text();
  const ayahs = parseQuranSQL(sqlText);
  onProgress?.({ phase: 'parsing', current: ayahs.length, total: ayahs.length, message: `Parsed ${ayahs.length} ayahs` });

  if (ayahs.length === 0) {
    throw new Error('No ayahs found in SQL file');
  }

  // 2. Load embedding model
  onProgress?.({ phase: 'embedding', current: 0, total: ayahs.length, message: 'Loading embedding model...' });
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    device: 'webgpu',
  });

  // 3. Generate embeddings in batches
  const embeddings: number[][] = [];
  for (let i = 0; i < ayahs.length; i++) {
    const output = await embedder(ayahs[i].content, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(output.data as Float32Array));

    if ((i + 1) % 10 === 0 || i === ayahs.length - 1) {
      onProgress?.({ phase: 'embedding', current: i + 1, total: ayahs.length, message: `Embedding ayah ${i + 1} / ${ayahs.length}` });
    }
  }

  // 4. Batch insert with transaction
  onProgress?.({ phase: 'inserting', current: 0, total: ayahs.length, message: 'Inserting into database...' });

  await db.exec('BEGIN');
  try {
    for (let i = 0; i < ayahs.length; i += BATCH_SIZE) {
      const batch = ayahs.slice(i, i + BATCH_SIZE);
      const batchEmbeddings = embeddings.slice(i, i + BATCH_SIZE);

      for (let j = 0; j < batch.length; j++) {
        const embStr = `[${batchEmbeddings[j].join(',')}]`;
        await db.query(
          'INSERT INTO knowledge (content, surah, ayah, embedding) VALUES ($1, $2, $3, $4)',
          [batch[j].content, batch[j].surah, batch[j].ayah, embStr]
        );
      }

      onProgress?.({
        phase: 'inserting',
        current: Math.min(i + BATCH_SIZE, ayahs.length),
        total: ayahs.length,
        message: `Inserted ${Math.min(i + BATCH_SIZE, ayahs.length)} / ${ayahs.length}`
      });
    }
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }

  onProgress?.({ phase: 'complete', current: ayahs.length, total: ayahs.length, message: `Done! ${ayahs.length} ayahs seeded.` });
  return ayahs.length;
}
