import { useState, useCallback } from 'react';
import { explainQuery, type VerseContext } from '@/lib/ai/explain';

interface RAGState {
  explanation: string | null;
  verses: VerseContext[];
  loading: boolean;
  error: string | null;
}

export function useRAG() {
  const [state, setState] = useState<RAGState>({
    explanation: null,
    verses: [],
    loading: false,
    error: null,
  });

  const askAI = useCallback(async (query: string, lang: string = 'en') => {
    if (!query.trim()) return;

    setState((prev) => ({ ...prev, loading: true, error: null, explanation: null }));

    try {
      const result = await explainQuery(query, lang);
      setState({
        explanation: result.explanation,
        verses: result.verses,
        loading: false,
        error: null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
    }
  }, []);

  const clearAI = useCallback(() => {
    setState({
      explanation: null,
      verses: [],
      loading: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    askAI,
    clearAI,
  };
}
