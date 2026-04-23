'use client';

import { useState, useRef } from 'react';
import { getDatabase } from '@/lib/db';
import { parseQuranSQL } from '@/lib/parsers/quran';
import { parseHadithCSV, cleanForEmbedding } from '@/lib/parsers/hadith';
import { parseCommentaryJSON } from '@/lib/parsers/commentary';
import { parseBooksCSV } from '@/lib/parsers/books';

export type IngestionStatus = 'IDLE' | 'PARSING' | 'EMBEDDING' | 'INSERTING' | 'COMPLETE' | 'ERROR' | 'ABORTED';
export type IngestionType = 'quran' | 'hadith' | 'commentary' | 'books';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB limit for browser safety

export function useIngestion() {
  const [status, setStatus] = useState<IngestionStatus>('IDLE');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const startIngestion = async (file: File, type: IngestionType) => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB. For large files, please use a smaller subset.`);
      setStatus('ERROR');
      return;
    }

    setStatus('PARSING');
    setProgress(0);
    setError(null);
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      // 1. Parser
      let data: { content: string; source_ref: string; category: string }[] = [];
      if (type === 'quran') {
        data = await parseQuranSQL(file);
      } else if (type === 'hadith') {
        // Check if it's books.csv (single column) or sanadset (multi-column)
        const preview = await file.text();
        const firstLine = preview.split('\n')[0];
        const commaCount = (firstLine.match(/,/g) || []).length;
        
        if (commaCount === 0 || (commaCount === 1 && firstLine === 'Book')) {
          // It's books.csv
          data = await parseBooksCSV(file);
        } else {
          // It's sanadset
          data = await parseHadithCSV(file);
        }
      } else if (type === 'commentary') {
        data = await parseCommentaryJSON(file);
      } else if (type === 'books') {
        data = await parseBooksCSV(file);
      }

      if (signal.aborted) throw new Error('ABORTED');

      if (data.length === 0) {
        console.error('Parser returned no data. File:', file.name, 'Type:', type, 'Size:', file.size);
        throw new Error(`No data found in file. File: ${file.name} (${(file.size / 1024).toFixed(1)} KB). Make sure you selected the correct file type.`);
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

              // 4. PGlite Batch Insert with duplicate handling
              let inserted = 0;
              let skipped = 0;
              
              for (let j = 0; j < chunk.length; j++) {
                try {
                  // Check for duplicate before inserting
                  const existing = await db.query(
                    'SELECT id FROM knowledge WHERE source_ref = $1 AND category = $2 LIMIT 1',
                    [chunk[j].source_ref, chunk[j].category]
                  );
                  
                  if (existing.rows.length > 0) {
                    skipped++;
                  } else {
                    await db.query(
                      'INSERT INTO knowledge (content, source_ref, category, embedding) VALUES ($1, $2, $3, $4)',
                      [
                        chunk[j].content,
                        chunk[j].source_ref,
                        chunk[j].category,
                        `[${embeddings[j].join(',')}]`
                      ]
                    );
                    inserted++;
                  }
                } catch (err: any) {
                  console.error('Insert error:', err.message);
                }
              }
              
              if (skipped > 0) {
                console.log(`Batch: ${inserted} inserted, ${skipped} duplicates skipped`);
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
