'use client';

import { useState, useRef } from 'react';
import { getDatabase } from '@/lib/db';
import { parseQuranSQL } from '@/lib/parsers/quran';
import { parseHadithCSV, cleanForEmbedding } from '@/lib/parsers/hadith';

export type IngestionStatus = 'IDLE' | 'PARSING' | 'EMBEDDING' | 'INSERTING' | 'COMPLETE' | 'ERROR' | 'ABORTED';

export function useIngestion() {
  const [status, setStatus] = useState<IngestionStatus>('IDLE');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const startIngestion = async (file: File, type: 'quran' | 'hadith') => {
    setStatus('PARSING');
    setProgress(0);
    setError(null);
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      // 1. Parser
      let data = [];
      if (type === 'quran') {
        data = await parseQuranSQL(file);
      } else {
        data = await parseHadithCSV(file);
      }

      if (signal.aborted) throw new Error('ABORTED');

      if (data.length === 0) {
        throw new Error('No data found in file.');
      }

      // 2. Worker Initialization
      setStatus('EMBEDDING');
      const worker = new Worker(new URL('../workers/embedding.worker.ts', import.meta.url));
      
      const db = await getDatabase();
      const batchSize = 50;
      const total = data.length;

      await new Promise<void>((resolve, reject) => {
        signal.addEventListener('abort', () => {
          worker.terminate();
          setStatus('ABORTED');
          reject(new Error('ABORTED'));
        });

        worker.onmessage = async (event) => {
          const { type: msgType, payload } = event.data;

          if (msgType === 'READY') {
            // Process in chunks of 50
            for (let i = 0; i < total; i += batchSize) {
              if (signal.aborted) break;

              const chunk = data.slice(i, i + batchSize);
              
              // Prepare texts for embedding (clean if hadith)
              const textsToEmbed = chunk.map(item => 
                type === 'hadith' ? cleanForEmbedding(item.content) : item.content
              );

              // Request embeddings from worker
              worker.postMessage({
                type: 'EMBED',
                payload: { texts: textsToEmbed, batchId: `chunk-${i}` }
              });

              // Wait for completion of this chunk
              const embeddings = await new Promise<number[][]>((res, rej) => {
                 const handler = (e: MessageEvent) => {
                   if (e.data.type === 'EMBEDDING_COMPLETE') {
                     worker.removeEventListener('message', handler);
                     res(e.data.payload.embeddings);
                   } else if (e.data.type === 'ERROR') {
                     worker.removeEventListener('message', handler);
                     rej(new Error(e.data.payload.message));
                   }
                 };
                 worker.addEventListener('message', handler);
              });

              // 4. PGLite Batch Insert
              for (let j = 0; j < chunk.length; j++) {
                await db.query(
                  'INSERT INTO knowledge (content, source_ref, category, embedding) VALUES ($1, $2, $3, $4)',
                  [
                    chunk[j].content, // original tags kept
                    chunk[j].source_ref,
                    chunk[j].category,
                    `[${embeddings[j].join(',')}]`
                  ]
                );
              }

              const currentProgress = Math.min(Math.round(((i + batchSize) / total) * 100), 100);
              setProgress(currentProgress);
            }
            worker.terminate();
            resolve();
          } else if (msgType === 'ERROR') {
            worker.terminate();
            reject(new Error(payload.message));
          }
        };

        worker.postMessage({ type: 'LOAD' });
      });

      setStatus('COMPLETE');
    } catch (err: any) {
      if (err.message === 'ABORTED') {
        // Handled above
      } else {
        console.error('Ingestion failed:', err);
        setError(err.message);
        setStatus('ERROR');
      }
    }
  };

  const abortIngestion = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return { startIngestion, abortIngestion, status, progress, error };
}
