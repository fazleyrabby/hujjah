'use client';

import { useState, useEffect } from 'react';
import {
  searchNarrators,
  getNarratorEdges,
  getHadithsForEdge,
  getNarratorGraph,
  type NarratorNode,
  type NarratorEdge,
  type HadithChain,
} from '@/lib/chain-db';
import { clsx } from 'clsx';

export default function ChainPage() {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NarratorNode[]>([]);
  const [selectedNarrator, setSelectedNarrator] = useState<NarratorNode | null>(null);
  const [edges, setEdges] = useState<{ teachers: NarratorEdge[]; students: NarratorEdge[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<NarratorEdge | null>(null);
  const [edgeHadith, setEdgeHadith] = useState<HadithChain[]>([]);
  const [graphMode, setGraphMode] = useState(false);
  const [graphData, setGraphData] = useState<{ nodes: NarratorNode[]; edges: NarratorEdge[] } | null>(null);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('hujjah-dark');
    if (saved) setDarkMode(saved === 'true');
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('hujjah-dark', String(darkMode));
  }, [darkMode]);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await searchNarrators(q, 20);
      setResults(rows);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectNarrator = async (n: NarratorNode) => {
    setSelectedNarrator(n);
    setResults([]);
    setQuery(n.name_ar);
    setSelectedEdge(null);
    setEdgeHadith([]);
    setGraphData(null);
    setGraphMode(false);
    try {
      const e = await getNarratorEdges(n.id);
      setEdges(e);
    } catch (err) {
      console.error('Failed to load edges:', err);
    }
  };

  const handleSelectEdge = async (edge: NarratorEdge) => {
    setSelectedEdge(edge);
    setLoading(true);
    try {
      const hadith = await getHadithsForEdge(edge.from_narrator_id, edge.to_narrator_id, 10);
      setEdgeHadith(hadith);
    } finally {
      setLoading(false);
    }
  };

  const handleShowGraph = async () => {
    if (!selectedNarrator) return;
    setGraphMode(true);
    setLoading(true);
    try {
      const g = await getNarratorGraph(selectedNarrator.id, 2);
      setGraphData(g);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className={clsx('min-h-screen bg-base', darkMode && 'dark')}>
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-lg font-bold text-gray-900 dark:text-white tracking-tight hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
              Hujjah
            </a>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Chain Explorer</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode((d) => !d)}
              className="w-9 h-9 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              {darkMode ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Search */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Sanad Chain Explorer</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Search for a narrator to explore their transmission chains. Currently covers Kutub al-Sittah (36K hadith).
          </p>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search narrator name (Arabic)..."
              className="w-full px-5 py-3.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow text-base shadow-sm"
              dir="rtl"
            />
            {loading && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Search Results */}
          {results.length > 0 && (
            <div className="mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
              {results.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleSelectNarrator(n)}
                  className="w-full px-4 py-3 text-right border-b border-gray-100 dark:border-zinc-800 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                  dir="rtl"
                >
                  <span className="text-sm text-gray-900 dark:text-white">{n.name_ar}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Narrator Profile */}
        {selectedNarrator && edges && (
          <div className="space-y-6">
            {/* Profile Card */}
            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white" dir="rtl">
                  {selectedNarrator.name_ar}
                </h3>
                <button
                  onClick={handleShowGraph}
                  className="px-3 py-1.5 text-xs font-medium bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded-lg border border-teal-100 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
                >
                  Show Graph (2-hop)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{edges.teachers.length}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Teachers (narrated from)</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{edges.students.length}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Students (narrated to)</div>
                </div>
              </div>
            </div>

            {/* Graph Mode */}
            {graphMode && graphData && (
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">2-Hop Network</h4>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  {graphData.nodes.length} narrators · {graphData.edges.length} transmission links
                </div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {graphData.edges.map((e, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-gray-50 dark:border-zinc-800">
                      <span className="text-gray-700 dark:text-gray-300 truncate flex-1 text-right" dir="rtl">{e.from_name}</span>
                      <span className="text-teal-600 dark:text-teal-400 font-medium">→ {e.hadith_count}</span>
                      <span className="text-gray-700 dark:text-gray-300 truncate flex-1" dir="rtl">{e.to_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Teachers */}
            {edges.teachers.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Teachers (narrated from)</h4>
                <div className="space-y-2">
                  {edges.teachers.map((e) => (
                    <button
                      key={`t-${e.from_narrator_id}`}
                      onClick={() => handleSelectEdge(e)}
                      className={clsx(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-right',
                        selectedEdge?.from_narrator_id === e.from_narrator_id && selectedEdge?.to_narrator_id === e.to_narrator_id
                          ? 'bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800'
                          : 'hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent'
                      )}
                      dir="rtl"
                    >
                      <span className="text-sm text-gray-900 dark:text-white">{e.from_name}</span>
                      <span className="text-xs text-teal-600 dark:text-teal-400 font-medium ml-2">{e.hadith_count} hadith</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Students */}
            {edges.students.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Students (narrated to)</h4>
                <div className="space-y-2">
                  {edges.students.map((e) => (
                    <button
                      key={`s-${e.to_narrator_id}`}
                      onClick={() => handleSelectEdge(e)}
                      className={clsx(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-right',
                        selectedEdge?.from_narrator_id === e.from_narrator_id && selectedEdge?.to_narrator_id === e.to_narrator_id
                          ? 'bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800'
                          : 'hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent'
                      )}
                      dir="rtl"
                    >
                      <span className="text-sm text-gray-900 dark:text-white">{e.to_name}</span>
                      <span className="text-xs text-teal-600 dark:text-teal-400 font-medium ml-2">{e.hadith_count} hadith</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Edge Hadith */}
            {selectedEdge && edgeHadith.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                  Hadith: {selectedEdge.from_name} → {selectedEdge.to_name}
                </h4>
                <div className="space-y-4">
                  {edgeHadith.map((h) => (
                    <div key={h.hadith_id} className="border-b border-gray-100 dark:border-zinc-800 last:border-0 pb-4 last:pb-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-white bg-gray-900 dark:bg-teal-700 px-2 py-0.5 rounded">
                          {h.book_name_en || h.book_name_ar}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">#{h.num_in_book}</span>
                      </div>
                      {/* Chain */}
                      <div className="flex flex-wrap items-center gap-1 mb-2">
                        {h.chain.map((n, i) => (
                          <span key={n.id} className="flex items-center gap-1">
                            <span className="text-xs text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 rounded-full">
                              {n.name_ar}
                            </span>
                            {i < h.chain.length - 1 && (
                              <span className="text-gray-400 dark:text-gray-600">→</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed" dir="rtl">
                        {h.matn_ar}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
