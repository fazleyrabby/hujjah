'use client';

import { useState } from 'react';
import { semanticSearch, SearchResult } from '@/lib/search';

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function performSearch(query: string) {
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const searchResults = await semanticSearch(query);
      setResults(searchResults);
      return searchResults;
    } catch (err) {
      console.error('Search failed:', err);
      setError(err instanceof Error ? err : new Error('Search failed'));
      return [];
    } finally {
      setLoading(false);
    }
  }

  return { results, loading, error, performSearch };
}
