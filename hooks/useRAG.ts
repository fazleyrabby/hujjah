'use client';

import { useState, useRef, useEffect } from 'react';
import { buildPrompt } from '@/lib/prompt';

export function useRAG() {
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const generateAnswer = async (query: string, results: any[]) => {
    if (results.length === 0) return;
    
    setLoading(true);
    setAnswer('');
    setError(null);
    setStreaming(true);

    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../workers/llm.worker.ts', import.meta.url));
    }

    const worker = workerRef.current;

    worker.onmessage = (event) => {
      const { type, payload } = event.data;

      if (type === 'READY') {
        const prompt = buildPrompt(query, results);
        worker.postMessage({ type: 'GENERATE', payload: { prompt } });
      } else if (type === 'TOKEN') {
        // Simple append for streaming (Qwen tokenizer might yield full chunks depending on logic)
        setAnswer(payload.token); 
      } else if (type === 'COMPLETE') {
        setAnswer(payload.response);
        setLoading(false);
        setStreaming(false);
      } else if (type === 'ERROR') {
        setError(payload.message);
        setLoading(false);
        setStreaming(false);
      }
    };

    worker.postMessage({ type: 'LOAD' });
  };

  return { answer, loading, error, streaming, generateAnswer };
}
