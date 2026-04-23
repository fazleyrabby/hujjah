'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  getSurahList,
  getSurahVerses,
  processQuery,
  getQuranStats,
  type SearchResult,
  type Surah,
  type SurahVerse,
  type QuranStats,
} from '@/lib/db';
import { useQuranAudio } from '@/hooks/useQuranAudio';

const SUPPORTED_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'bn', label: 'বাংলা' },
];

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [lang, setLang] = useState('en');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<QuranStats>({ verses: 0, translations: 0, languages: 0 });
  const [latency, setLatency] = useState<number | null>(null);
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [selectedSurah, setSelectedSurah] = useState<number | null>(null);
  const [surahVerses, setSurahVerses] = useState<SurahVerse[] | null>(null);
  const [searchMode, setSearchMode] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const { play: playAudio, isPlaying: isAudioPlaying, current: currentAudio } = useQuranAudio();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Init ───
  useEffect(() => {
    setMounted(true);
    getQuranStats().then(setStats).catch(console.error);
    getSurahList().then(setSurahs).catch(console.error);
  }, []);

  // ─── Debounced Search ───
  const executeSearch = useCallback(
    async (searchQuery: string, activeLang: string) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) {
        setResults(null);
        return;
      }

      setLoading(true);
      setError(null);
      setResults(null);
      setLatency(null);
      setSurahVerses(null);
      setSelectedSurah(null);
      setSearchMode(true);

      const start = performance.now();
      try {
        const rows = await processQuery(trimmed, activeLang, 20);
        setResults(rows);
        setLatency(Math.round(performance.now() - start));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        executeSearch(value, lang);
      }, 300);
    },
    [executeSearch, lang]
  );

  // ─── Language Toggle ───
  const handleLangChange = useCallback(
    (newLang: string) => {
      setLang(newLang);
      if (query.trim()) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          executeSearch(query, newLang);
        }, 150);
      }
      if (selectedSurah) {
        loadSurah(selectedSurah, newLang);
      }
    },
    [query, selectedSurah, executeSearch]
  );

  // ─── Surah Selection ───
  const loadSurah = useCallback(async (surahId: number, activeLang: string) => {
    setLoading(true);
    setSearchMode(false);
    setResults(null);
    setError(null);
    try {
      const verses = await getSurahVerses(surahId, activeLang);
      setSurahVerses(verses);
      setSelectedSurah(surahId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSurahClick = useCallback(
    (surahId: number) => {
      loadSurah(surahId, lang);
    },
    [loadSurah, lang]
  );

  // ─── Submit on Enter ───
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    executeSearch(query, lang);
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
    <div className="min-h-screen bg-base flex">
      {/* ─── Sidebar: Toggleable, Sticky, Scrollable ─── */}
      {sidebarOpen && (
        <aside className="w-64 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col h-screen sticky top-0">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Surahs</h2>
              <p className="text-xs text-gray-400 mt-1">{surahs.length} chapters</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              title="Close sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {surahs.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSurahClick(s.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  selectedSurah === s.id
                    ? 'bg-teal-50 text-teal-900'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="text-xs font-mono text-gray-400 w-6">{s.id}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {lang === 'bn' ? s.name_bn : s.name_en}
                  </p>
                  <p className="text-xs text-gray-400 truncate" dir="rtl">
                    {s.name_ar}
                  </p>
                </div>
              </button>
            ))}
          </nav>
        </aside>
      )}

      {/* ─── Main Content ─── */}
      <main className="flex-1 min-w-0">
        {/* Header with Language Toggle + Sidebar Toggle */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {!sidebarOpen && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    title="Open sidebar"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                )}
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Hujjah</h1>
                  <p className="text-sm text-gray-500 mt-1">
                    {stats.verses > 0
                      ? `${stats.verses.toLocaleString()} verses · ${stats.translations.toLocaleString()} translations`
                      : 'Local Islamic Research Engine'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Language Toggle */}
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  {SUPPORTED_LANGS.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => handleLangChange(l.code)}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                        lang === l.code
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>

                {/* Dark Mode Toggle */}
                <button
                  onClick={() => setDarkMode((d) => !d)}
                  className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                  title={darkMode ? 'Switch to light' : 'Switch to dark'}
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

                {/* About Link */}
                <a
                  href="/about"
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  About
                </a>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Search */}
          <form onSubmit={handleSubmit} className="mb-8">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder={lang === 'bn' ? 'কুরআন অনুসন্ধান...' : 'Search the Quran...'}
                disabled={loading}
                className="w-full px-5 py-4 pr-32 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-shadow disabled:opacity-50 text-base"
              />
              {query.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setResults(null);
                    setSurahVerses(null);
                    setSelectedSurah(null);
                  }}
                  className="absolute right-[5.5rem] top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors z-10"
                  title="Clear search"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed z-0"
              >
                {loading ? '...' : lang === 'bn' ? 'খুঁজুন' : 'Search'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {lang === 'bn'
                ? 'সূরা নাম, আয়াত রেফারেন্স (২:২৫৫), বা কীওয়ার্ড দিয়ে খুঁজুন'
                : 'Try surah names, references (2:255), or keywords like "mercy"'}
            </p>
          </form>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Results meta */}
          {results !== null && searchMode && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                {results.length > 0 ? `${results.length} results` : 'No results'}
              </p>
              {latency !== null && <p className="text-xs text-gray-400">{latency}ms</p>}
            </div>
          )}

          {/* Search Results */}
          {searchMode && results && results.length > 0 && (
            <div className="space-y-4">
              {results.map((r, i) => {
                const isPlayingThis = isAudioPlaying && currentAudio?.surah === r.surah && currentAudio?.ayah === r.ayah;
                return (
                  <article
                    key={`${r.surah}-${r.ayah}-${r.translator_slug}-${i}`}
                    className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-subtle hover:border-teal-200 transition-all"
                    title={`Go to ${r.surah_name} ${r.surah}:${r.ayah}`}
                  >
                    {/* Type Badge + Meta */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white bg-gray-900 px-2 py-0.5 rounded">
                          {r.label}
                        </span>
                        <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
                          {r.surah}:{r.ayah}
                        </span>
                        <span className="text-xs font-medium text-gray-600">
                          {r.surah_name}
                        </span>
                        <span className="text-xs text-gray-400 capitalize">
                          {r.translator_slug}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.rank !== 0 && (
                          <span className="text-xs text-gray-300">
                            rank {r.rank.toFixed(4)}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playAudio({ surah: r.surah, ayah: r.ayah, autoPlay: false });
                          }}
                          className={`p-1.5 rounded-full transition-colors ${
                            isPlayingThis
                              ? 'bg-teal-100 text-teal-700'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                          title={isPlayingThis ? 'Playing...' : 'Play audio'}
                        >
                          {isPlayingThis ? (
                            <svg className="w-3.5 h-3.5 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                  <div onClick={() => handleSurahClick(r.surah)} className="cursor-pointer">
                    {/* Arabic */}
                    {r.text_ar && (
                      <p
                        className="text-lg font-arabic text-gray-900 leading-relaxed mb-3"
                        dir="rtl"
                      >
                        {r.text_ar}
                      </p>
                    )}

                    {/* Snippet / Translation */}
                    {r.snippet ? (
                      <p
                        className="text-sm text-gray-700 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: r.snippet }}
                      />
                    ) : (
                      <p className="text-sm text-gray-700 leading-relaxed">{r.text}</p>
                    )}

                    {/* Click hint */}
                    <p className="text-xs text-teal-600 mt-3 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                      {lang === 'bn' ? 'সূরায় যান' : 'Go to surah'}
                    </p>
                  </div>
                </article>
              );
            })}
            </div>
          )}

          {/* Surah Loading State */}
          {loading && !searchMode && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-6">
                <div className="space-y-2">
                  <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
              </div>
              {[...Array(7)].map((_, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-16 bg-gray-200 rounded-full animate-pulse" />
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                  </div>
                  <div className="h-8 w-full bg-gray-200 rounded animate-pulse" />
                  <div className="h-16 w-full bg-gray-200 rounded animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {/* Surah Reading View */}
          {!loading && !searchMode && surahVerses && selectedSurah && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {lang === 'bn'
                      ? surahs.find((s) => s.id === selectedSurah)?.name_bn
                      : surahs.find((s) => s.id === selectedSurah)?.name_en}
                  </h2>
                  <p className="text-sm text-gray-500" dir="rtl">
                    {surahs.find((s) => s.id === selectedSurah)?.name_ar}
                  </p>
                </div>
                <span className="text-xs text-gray-400">
                  {surahVerses.length} verses
                </span>
              </div>

              <div className="space-y-6">
                {surahVerses.map((v, i) => {
                  const isPlayingThis = isAudioPlaying && currentAudio?.surah === v.surah && currentAudio?.ayah === v.ayah;
                  return (
                    <div
                      key={`${v.id}-${v.translator_slug}-${i}`}
                      className="bg-white border border-gray-200 rounded-xl p-5"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
                            {v.surah}:{v.ayah}
                          </span>
                          <span className="text-xs text-gray-400 capitalize">
                            {v.translator_slug}
                          </span>
                        </div>
                        <button
                          onClick={() => playAudio({ surah: v.surah, ayah: v.ayah, autoPlay: false })}
                          className={`p-2 rounded-full transition-colors ${
                            isPlayingThis
                              ? 'bg-teal-100 text-teal-700'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                          title={isPlayingThis ? 'Playing...' : 'Play audio'}
                        >
                          {isPlayingThis ? (
                            <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <p
                        className="text-lg font-arabic text-gray-900 leading-relaxed mb-3"
                        dir="rtl"
                      >
                        {v.text_ar}
                      </p>
                      <p className="text-sm text-gray-700 leading-relaxed">{v.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && results === null && surahVerses === null && (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {lang === 'bn' ? 'কুরআন অনুসন্ধান' : 'Search the Quran'}
              </h3>
              <p className="text-gray-500 max-w-md mx-auto text-sm">
                {lang === 'bn'
                  ? 'সূরা নাম, আয়াত রেফারেন্স, বা কীওয়ার্ড দিয়ে খুঁজুন'
                  : 'Type a topic like "mercy", "prayer", or "patience" to find relevant verses.'}
              </p>
            </div>
          )}

          {/* No results */}
          {!loading && searchMode && results !== null && results.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 text-sm">
                {lang === 'bn'
                  ? 'কোনো আয়াত পাওয়া যায়নি। অন্য কীওয়ার্ড দিয়ে চেষ্টা করুন।'
                  : 'No verses found. Try different keywords or check that the database is seeded.'}
              </p>
            </div>
          )}

          {/* Disclaimer */}
          <div className="mt-12 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-400 leading-relaxed">
              <span className="font-medium text-gray-500">Disclaimer:</span> Any AI-generated summary or analysis may not be 100% correct. Please cross-check with qualified scholars or other authentic sources using the verse references provided.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
