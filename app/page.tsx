'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { pipeline, env } from '@huggingface/transformers';
import { ContentCard } from '@/components/ui/ContentCard';
import { hybridSearch, purgeLegacyStorage, getStats, SearchResult } from '@/lib/db';

// Allow Transformers.js to work in Tauri webview
env.allowLocalModels = false;
env.useBrowserCache = true;
(env.backends as any).onnx.wasm.proxy = false;

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({ total: 0, quran: 0, hadith: 0, books: 0 });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  
  const embedderRef = useRef<any>(null);
  const summarizerRef = useRef<any>(null);

  // ─── Init ───
  useEffect(() => {
    setMounted(true);
    initApp();
  }, []);

  const initApp = async () => {
    try {
      // TASK 0: Purge legacy storage on first run
      const purged = await purgeLegacyStorage();
      console.log(purged);

      // Load stats
      const s = await getStats();
      setStats(s);

      // Load embedding model
      setModelStatus('loading');
      embedderRef.current = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        { device: 'webgpu', progress_callback: (p: any) => {
          if (p.status === 'progress') {
            console.log(`Model: ${Math.round(p.progress)}%`);
          }
        }}
      );

      // Load summarizer (optional, lightweight)
      try {
        summarizerRef.current = await pipeline(
          'text-generation',
          'Xenova/Qwen2.5-0.5B-Instruct',
          { device: 'webgpu' }
        );
      } catch {
        console.log('Summarizer not loaded (optional)');
      }

      setModelStatus('ready');
    } catch (e: any) {
      setError(e.message);
      setModelStatus('idle');
    }
  };

  // ─── Search ───
  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !embedderRef.current) return;

    setLoading(true);
    setError(null);
    setResults(null);
    setAiSummary(null);

    try {
      // Embed query
      const output = await embedderRef.current(query.trim(), {
        pooling: 'mean',
        normalize: true,
      });
      const embedding = Array.from(output.data as Float32Array);

      // Hybrid search
      const searchResults = await hybridSearch({
        query: query.trim(),
        queryEmbedding: embedding,
        limit: 5,
      });

      setResults(searchResults);

      // Generate Scholar AI summary
      if (searchResults.length > 0) {
        generateSummary(searchResults, query.trim());
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  // ─── TASK 3: Scholar AI Summary ───
  const generateSummary = async (results: SearchResult[], query: string) => {
    setAiLoading(true);

    try {
      if (summarizerRef.current) {
        // Build prompt with citations
        const context = results
          .map((r, i) => `[${i + 1}] ${r.ref}: ${r.text.substring(0, 200)}`)
          .join('\n');

        const prompt = `You are a scholarly Islamic research assistant. Based ONLY on the following Quranic verses and Hadith, provide a concise 2-line answer to the user's question. Cite your sources using [1], [2], etc. If the answer is not in the text, say "Information not found in current sources."

User question: ${query}

Sources:
${context}

Scholarly answer:`;

        const output = await summarizerRef.current(prompt, {
          max_new_tokens: 128,
          temperature: 0.3,
          do_sample: true,
        });

        const text = output[0]?.generated_text || '';
        // Extract just the answer part (after the prompt)
        const answer = text.split('Scholarly answer:').pop()?.trim() || text;
        setAiSummary(answer);
      } else {
        // Fallback: citation list without LLM
        setAiSummary(
          `Found ${results.length} relevant passages. Review the verses below for guidance on "${query}".`
        );
      }
    } catch {
      setAiSummary('Select a result to view the full text.');
    } finally {
      setAiLoading(false);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading Hujjah...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Hujjah</h1>
              <p className="text-sm text-gray-500 mt-1">
                {stats.total > 0
                  ? `${stats.total.toLocaleString()} passages indexed`
                  : 'Local Islamic Research Engine'}
              </p>
            </div>
            {stats.total > 0 && (
              <div className="flex gap-4 text-xs text-gray-400">
                <span>Quran: {stats.quran.toLocaleString()}</span>
                <span>Hadith: {stats.hadith.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Model Loading */}
        {modelStatus === 'loading' && (
          <div className="mb-6 p-3 bg-teal-50 border border-teal-200 rounded-lg flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-teal-800">Downloading AI models (one-time setup)...</p>
          </div>
        )}

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about mercy, prayer, patience, guidance..."
              disabled={loading || modelStatus !== 'ready'}
              className="w-full px-5 py-4 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-shadow disabled:opacity-50 text-base"
            />
            <button
              type="submit"
              disabled={loading || modelStatus !== 'ready' || !query.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <ContentCard className="mb-6 border-red-200 bg-red-50">
            <p className="text-red-700 text-sm">{error}</p>
          </ContentCard>
        )}

        {/* Scholar AI Summary */}
        {(aiLoading || aiSummary) && (
          <ContentCard variant="elevated" className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-teal-500" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Scholar AI
              </h2>
            </div>
            {aiLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="w-3 h-3 border border-teal-600 border-t-transparent rounded-full animate-spin" />
                Generating summary...
              </div>
            ) : (
              <p className="text-gray-800 leading-relaxed text-sm">{aiSummary}</p>
            )}
          </ContentCard>
        )}

        {/* Results */}
        {results && results.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Relevant Passages ({results.length})
            </h3>
            {results.map((result) => (
              <ContentCard key={result.id} hover className="group">
                <div className="flex items-start gap-4">
                  {/* Type Badge */}
                  <div className="flex-shrink-0 mt-1">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        result.type === 'quran'
                          ? 'bg-teal-500'
                          : result.type === 'hadith'
                          ? 'bg-amber-500'
                          : 'bg-gray-400'
                      }`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Meta */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
                        {result.ref}
                      </span>
                      <span className="text-xs text-gray-400 capitalize">{result.type}</span>
                      {result.score > 0 && (
                        <span className="text-xs text-gray-400">
                          {result.score > 1 ? `RRF ${result.score.toFixed(2)}` : `${Math.round(result.score * 100)}%`}
                        </span>
                      )}
                    </div>

                    {/* Text */}
                    <p
                      className={`text-gray-900 leading-relaxed ${
                        result.type === 'quran' ? 'text-lg font-arabic' : 'text-sm'
                      }`}
                      dir={result.type === 'quran' ? 'rtl' : 'ltr'}
                    >
                      {result.text}
                    </p>
                  </div>
                </div>
              </ContentCard>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && results === null && (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Ask the Quran</h3>
            <p className="text-gray-500 max-w-md mx-auto text-sm">
              Search by meaning — type a topic like "mercy", "prayer", or "patience" to find relevant verses.
            </p>
          </div>
        )}

        {/* No Results */}
        {!loading && results !== null && results.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">
              No passages found. Try different keywords or check that the database is seeded.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
