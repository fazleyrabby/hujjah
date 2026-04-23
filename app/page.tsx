'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ContentCard } from '@/components/ui/ContentCard';
import { getDatabase, getAyahCount } from '@/lib/db';

interface SearchResult {
  id: number;
  content: string;
  surah: number;
  ayah: number;
  similarity: number;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [totalAyahs, setTotalAyahs] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Init database + worker
  useEffect(() => {
    setMounted(true);

    // Load ayah count
    getAyahCount().then(setTotalAyahs).catch(() => setTotalAyahs(0));

    // Init search worker
    const worker = new Worker(new URL('../workers/search.worker.ts', import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const { type, payload } = e.data;
      if (type === 'READY') {
        setModelStatus('ready');
      } else if (type === 'STATUS') {
        setModelStatus('loading');
      } else if (type === 'RESULTS') {
        setResults(payload.results);
        setLoading(false);
      } else if (type === 'ERROR') {
        setError(payload);
        setLoading(false);
      }
    };

    worker.postMessage({ type: 'INIT' });
    setModelStatus('loading');

    return () => worker.terminate();
  }, []);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !workerRef.current) return;

    setLoading(true);
    setError(null);
    setResults(null);

    workerRef.current.postMessage({
      type: 'SEARCH',
      payload: { query: query.trim() }
    });
  }, [query]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-semibold text-gray-900">Hujjah</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalAyahs > 0
              ? `${totalAyahs.toLocaleString()} ayahs indexed`
              : 'Local Quran Research'}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Model Loading Banner */}
        {modelStatus === 'loading' && (
          <div className="mb-6 p-3 bg-teal-50 border border-teal-200 rounded-lg flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-teal-800">
              Downloading AI model (one-time, ~20MB)...
            </p>
          </div>
        )}

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about Quran, mercy, prayer, guidance..."
              disabled={loading || modelStatus !== 'ready'}
              className="w-full px-5 py-4 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-shadow disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || modelStatus !== 'ready' || !query.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <ContentCard className="mb-6 border-error/20 bg-red-50">
            <p className="text-error text-sm">{error}</p>
          </ContentCard>
        )}

        {/* Results */}
        {results && results.length > 0 && (
          <div className="space-y-6">
            {/* Scholar AI Response */}
            <ContentCard variant="elevated">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Scholar AI
              </h2>
              <div className="prose prose-gray max-w-none">
                <p className="text-gray-700 leading-relaxed text-sm">
                  Based on the Quran, here are the most relevant verses for your query:
                  <span className="block mt-2 text-gray-500 italic">
                    (Local LLM integration coming soon — results below are ranked by semantic similarity)
                  </span>
                </p>
              </div>
            </ContentCard>

            {/* Ayah Cards */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                Relevant Ayahs ({results.length})
              </h3>
              {results.map((result, index) => (
                <ContentCard key={result.id} hover>
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-50 text-teal-700 text-xs font-medium flex items-center justify-center mt-0.5">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
                          Surah {result.surah}:{result.ayah}
                        </span>
                        <span className="text-xs text-gray-400">
                          {Math.round(result.similarity * 100)}% match
                        </span>
                      </div>
                      <p className="text-gray-900 leading-relaxed text-base font-arabic" dir="rtl">
                        {result.content}
                      </p>
                    </div>
                  </div>
                </ContentCard>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && results === null && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Ask the Quran
            </h3>
            <p className="text-gray-500 max-w-md mx-auto text-sm">
              Search by meaning — type a topic like "mercy", "prayer", or "patience" to find relevant verses.
            </p>
          </div>
        )}

        {/* No Results */}
        {!loading && results !== null && results.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">No verses found for this query.</p>
          </div>
        )}
      </main>
    </div>
  );
}
