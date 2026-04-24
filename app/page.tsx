'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  getSurahList,
  getSurahVerses,
  getSurahTranslators,
  processQuery,
  processHadithQuery,
  getQuranStats,
  type SearchResult,
  type Surah,
  type SurahVerse,
  type QuranStats,
  type HadithResult,
} from '@/lib/db';
import { detectLang } from '@/lib/search-utils';
import { useQuranAudio } from '@/contexts/AudioContext';
import { useRAG } from '@/hooks/useRAG';
import ChatWidget from '@/components/ChatWidget';
import LinkedVerseText from '@/components/LinkedVerseText';
import { clsx } from 'clsx';

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
  const [availableTranslators, setAvailableTranslators] = useState<string[]>([]);
  const [selectedTranslator, setSelectedTranslator] = useState<string>('');
  const [searchMode, setSearchMode] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [searchDomain, setSearchDomain] = useState<'quran' | 'hadith'>('quran');
  const [hadithResults, setHadithResults] = useState<HadithResult[] | null>(null);
  const { play: playAudio, pause: pauseAudio, resume: resumeAudio, stop: stopAudio, isPlaying: isAudioPlaying, current: currentAudio } = useQuranAudio();
  const { askAI, explanation, loading: aiLoading, error: aiError, clearAI } = useRAG();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verseRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroll to currently playing verse
  useEffect(() => {
    if (currentAudio && selectedSurah === currentAudio.surah) {
      const key = `${currentAudio.surah}-${currentAudio.ayah}`;
      const el = verseRefs.current[key];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentAudio, selectedSurah]);

  // Highlight matching terms in text
  const highlightTerms = useCallback((text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text;
    const terms = searchQuery.trim().split(/\s+/).filter((t) => t.length > 2);
    if (terms.length === 0) return text;
    const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return text.replace(pattern, '<mark class="bg-amber-200 dark:bg-amber-700/60 px-0.5 rounded">$1</mark>');
  }, []);

  // ─── Init ───
  useEffect(() => {
    setMounted(true);
    getQuranStats().then(setStats).catch(console.error);
    getSurahList().then((list) => {
      setSurahs(list);
      // Auto-load surah from ?surah= query param
      const params = new URLSearchParams(window.location.search);
      const surahParam = params.get('surah');
      if (surahParam) {
        const id = parseInt(surahParam, 10);
        if (!isNaN(id) && id >= 1 && id <= 114) {
          loadSurah(id, lang);
        }
      }
    }).catch(console.error);
  }, []);

  // ─── Dark Mode Sync ───
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // ─── Debounced Search ───
  const executeSearch = useCallback(
    async (searchQuery: string, activeLang: string) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) {
        setResults(null);
        setHadithResults(null);
        return;
      }

      setLoading(true);
      setError(null);
      setResults(null);
      setHadithResults(null);
      setLatency(null);
      setSurahVerses(null);
      setSelectedSurah(null);
      setSearchMode(true);

      const start = performance.now();
      try {
        // Auto-detect @hadith command
        const isHadithCommand = trimmed.toLowerCase().startsWith('@hadith');
        const domain = isHadithCommand ? 'hadith' : searchDomain;

        // Use the explicitly selected language (from toggle or initial)
        // Auto-detect is only a fallback if no language preference set
        const searchLang = activeLang;

        if (domain === 'hadith') {
          const rows = await processHadithQuery(trimmed, 20, searchLang);
          setHadithResults(rows);
        } else {
          const rows = await processQuery(trimmed, searchLang, 20);
          setResults(rows);
        }
        setLatency(Math.round(performance.now() - start));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [searchDomain]
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

  // ─── Surah Selection ───
  const loadSurah = useCallback(async (surahId: number, activeLang: string, translatorSlug?: string) => {
    setLoading(true);
    setSearchMode(false);
    setResults(null);
    setError(null);
    try {
      const [verses, translators] = await Promise.all([
        getSurahVerses(surahId, activeLang, translatorSlug),
        getSurahTranslators(surahId, activeLang),
      ]);
      setSurahVerses(verses);
      setSelectedSurah(surahId);
      setAvailableTranslators(translators.map((t) => t.translator_slug));
      if (translatorSlug) {
        setSelectedTranslator(translatorSlug);
      } else if (verses.length > 0) {
        setSelectedTranslator(verses[0].translator_slug);
      } else {
        setSelectedTranslator('');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Language Toggle ───
  const handleLangChange = useCallback(
    (newLang: string) => {
      setLang(newLang);
      setSelectedTranslator('');
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
    [query, selectedSurah, executeSearch, loadSurah]
  );

  const handleSurahClick = useCallback(
    (surahId: number) => {
      loadSurah(surahId, lang);
    },
    [loadSurah, lang]
  );

  const handleNavigateToVerse = useCallback(
    async (surah: number, ayah: number) => {
      await loadSurah(surah, lang);
      // Scroll to verse after render
      setTimeout(() => {
        const el = document.getElementById(`verse-${surah}-${ayah}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-teal-500', 'bg-teal-50', 'dark:bg-teal-900/20');
          setTimeout(() => el.classList.remove('ring-2', 'ring-teal-500', 'bg-teal-50', 'dark:bg-teal-900/20'), 3000);
        }
      }, 300);
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
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading Hujjah...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('min-h-screen bg-base flex transition-colors duration-300', darkMode && 'dark')}>
      {/* ─── Sidebar: Toggleable, Sticky, Scrollable ─── */}
      {sidebarOpen && (
        <aside className="w-64 bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800 flex-shrink-0 flex flex-col h-screen sticky top-0">
          <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Surahs</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{surahs.length} chapters</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
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
                    ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-900 dark:text-teal-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800'
                }`}
              >
                <span className="text-xs font-mono text-gray-400 dark:text-gray-500 w-6">{s.id}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {lang === 'bn' ? s.name_bn : s.name_en}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate" dir="rtl">
                    {s.name_ar}
                  </p>
                </div>
              </button>
            ))}
          </nav>
        </aside>
      )}

      {/* ─── Main Content ─── */}
      <main className="flex-1 min-w-0 bg-base">
        {/* Sticky top bar: header + disclaimer + search — single solid block */}
        <div className="sticky top-0 z-50 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
          {/* Header */}
          <header>
            <div className="max-w-3xl mx-auto px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {!sidebarOpen && (
                    <button
                      onClick={() => setSidebarOpen(true)}
                      className="w-9 h-9 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                      title="Show surah list"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                  )}
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Hujjah</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {stats.verses > 0
                        ? `${stats.verses.toLocaleString()} verses · ${stats.translations.toLocaleString()} translations`
                        : 'Local Islamic Research Engine'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Language Toggle */}
                  <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
                    {SUPPORTED_LANGS.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => handleLangChange(l.code)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                          lang === l.code
                            ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>

                  {/* Dark Mode Toggle */}
                  <button
                    onClick={() => setDarkMode((d) => !d)}
                    className="w-9 h-9 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
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
                    className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    About
                  </a>
                </div>
              </div>
            </div>
          </header>

          {/* Disclaimer */}
          <div className="border-t border-amber-200/80 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/50 px-4 py-1.5">
            <p className="max-w-3xl mx-auto text-[10px] text-amber-700 dark:text-amber-400 leading-snug text-center">
              <span className="font-semibold">Disclaimer:</span> AI summaries may not be 100% correct. Cross-check with qualified scholars using the verse references provided.
            </p>
          </div>

          {/* Search Bar */}
          <div className="bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800/60">
          <div className="max-w-3xl mx-auto px-6 py-3">
            {/* Domain Toggle */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setSearchDomain('quran')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    searchDomain === 'quran'
                      ? 'bg-white dark:bg-zinc-700 text-teal-700 dark:text-teal-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {lang === 'bn' ? 'কুরআন' : 'Quran'}
                </button>
                <button
                  type="button"
                  onClick={() => setSearchDomain('hadith')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    searchDomain === 'hadith'
                      ? 'bg-white dark:bg-zinc-700 text-teal-700 dark:text-teal-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {lang === 'bn' ? 'হাদিস' : 'Hadith'}
                </button>
              </div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {searchDomain === 'hadith' ? '@hadith also works' : ''}
              </span>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder={searchDomain === 'hadith'
                    ? (lang === 'bn' ? 'হাদিস অনুসন্ধান...' : 'Search hadith...')
                    : (lang === 'bn' ? 'কুরআন অনুসন্ধান...' : 'Search the Quran...')
                  }
                  className="w-full px-5 py-3.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-shadow text-base shadow-sm"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {query.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setResults(null);
                        setSurahVerses(null);
                        setSelectedSurah(null);
                        clearAI();
                      }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
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
                    className="px-4 py-2 bg-gray-900 dark:bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-teal-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? '...' : lang === 'bn' ? 'খুঁজুন' : 'Search'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {lang === 'bn'
                  ? 'সূরা নাম, আয়াত রেফারেন্স (২:২৫৫), বা কীওয়ার্ড দিয়ে খুঁজুন'
                  : 'Try surah names, references (2:255), or keywords like "mercy"'}
              </p>
            </form>
          </div>
        </div>
        </div>{/* end sticky top bar */}

        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* AI Explanation Section */}
          {query.trim() && !loading && searchMode && results && results.length > 0 && (
            <div className="mb-8">
              {!explanation && !aiLoading && !aiError && (
                <button
                  onClick={() => askAI(query, lang)}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 text-sm font-medium rounded-lg border border-teal-100 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {lang === 'bn' ? 'এআই দিয়ে ব্যাখ্যা করুন' : 'Explain with AI'}
                </button>
              )}

              {aiLoading && (
                <div className="p-5 bg-white dark:bg-zinc-900 border border-teal-200 dark:border-teal-800 rounded-xl shadow-sm animate-pulse">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-4 h-4 bg-teal-200 dark:bg-teal-800 rounded-full" />
                    <div className="h-4 w-32 bg-gray-200 dark:bg-zinc-800 rounded" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-full bg-gray-100 dark:bg-zinc-800 rounded" />
                    <div className="h-3 w-5/6 bg-gray-100 dark:bg-zinc-800 rounded" />
                    <div className="h-3 w-4/6 bg-gray-100 dark:bg-zinc-800 rounded" />
                  </div>
                </div>
              )}

              {aiError && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-amber-700 dark:text-amber-400 text-xs">AI Error: {aiError}</p>
                </div>
              )}

              {explanation && (
                <div className="p-5 bg-teal-50/30 dark:bg-teal-900/10 border border-teal-100 dark:border-teal-800 rounded-xl relative animate-fade-in">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400 bg-teal-100/50 dark:bg-teal-900/30 px-2 py-0.5 rounded">
                        AI Insights
                      </span>
                    </div>
                    <button onClick={clearAI} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed italic">
                    "<LinkedVerseText text={explanation} onVerseClick={handleNavigateToVerse} />"
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Results meta */}
          {results !== null && searchMode && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {results.length > 0 ? `${results.length} results` : 'No results'}
              </p>
              {latency !== null && <p className="text-xs text-gray-400 dark:text-gray-500">{latency}ms</p>}
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
                    className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 hover:shadow-subtle hover:border-teal-200 dark:hover:border-teal-800 transition-all"
                    title={`Go to ${r.surah_name} ${r.surah}:${r.ayah}`}
                  >
                    {/* Type Badge + Meta */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white bg-gray-900 dark:bg-teal-700 px-2 py-0.5 rounded">
                          {r.label}
                        </span>
                        <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 rounded-full">
                          {r.surah}:{r.ayah}
                        </span>
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          {r.surah_name}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">
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
                              ? 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-400'
                              : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-zinc-700'
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
                        className="text-lg font-arabic text-gray-900 dark:text-white leading-relaxed mb-3"
                        dir="rtl"
                      >
                        {r.text_ar}
                      </p>
                    )}

                    {/* Snippet / Translation */}
                    {r.snippet ? (
                      <p
                        className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: r.snippet.replace(
                            /<mark>/g,
                            '<mark class="bg-amber-200 dark:bg-amber-700/60 px-0.5 rounded">'
                          ),
                        }}
                      />
                    ) : (
                      <p
                        className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: highlightTerms(r.text, query) }}
                      />
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
                  <div className="h-6 w-48 bg-gray-200 dark:bg-zinc-800 rounded animate-pulse" />
                  <div className="h-4 w-32 bg-gray-200 dark:bg-zinc-800 rounded animate-pulse" />
                </div>
                <div className="h-4 w-20 bg-gray-200 dark:bg-zinc-800 rounded animate-pulse" />
              </div>
              {[...Array(7)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-16 bg-gray-200 dark:bg-zinc-800 rounded-full animate-pulse" />
                    <div className="h-4 w-24 bg-gray-200 dark:bg-zinc-800 rounded animate-pulse" />
                  </div>
                  <div className="h-8 w-full bg-gray-200 dark:bg-zinc-800 rounded animate-pulse" />
                  <div className="h-16 w-full bg-gray-200 dark:bg-zinc-800 rounded animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {/* Surah Reading View */}
          {!loading && !searchMode && surahVerses && selectedSurah && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {lang === 'bn'
                      ? surahs.find((s) => s.id === selectedSurah)?.name_bn
                      : surahs.find((s) => s.id === selectedSurah)?.name_en}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400" dir="rtl">
                    {surahs.find((s) => s.id === selectedSurah)?.name_ar}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Audio Controls */}
                  <div className="flex items-center gap-1.5">
                    {/* Play */}
                    {(!isAudioPlaying || currentAudio?.surah !== selectedSurah) && (
                      <button
                        onClick={() => playAudio({ surah: selectedSurah, ayah: 1, autoPlay: true })}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 text-sm font-medium rounded-lg border border-teal-100 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
                        title={lang === 'bn' ? 'সূরা প্লে করুন' : 'Play surah'}
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        {lang === 'bn' ? 'সূরা শুনুন' : 'Play Surah'}
                      </button>
                    )}

                    {/* Pause */}
                    {isAudioPlaying && currentAudio?.surah === selectedSurah && (
                      <button
                        onClick={pauseAudio}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm font-medium rounded-lg border border-amber-100 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                        title={lang === 'bn' ? 'বিরতি' : 'Pause'}
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                        </svg>
                        {lang === 'bn' ? 'বিরতি' : 'Pause'}
                      </button>
                    )}

                    {/* Resume */}
                    {!isAudioPlaying && currentAudio?.surah === selectedSurah && currentAudio && (
                      <button
                        onClick={resumeAudio}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 text-sm font-medium rounded-lg border border-teal-100 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
                        title={lang === 'bn' ? 'আবার শুনুন' : 'Resume'}
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        {lang === 'bn' ? 'আবার শুনুন' : 'Resume'}
                      </button>
                    )}

                    {/* Stop */}
                    {currentAudio?.surah === selectedSurah && (
                      <button
                        onClick={stopAudio}
                        className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm font-medium rounded-lg border border-red-100 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                        title={lang === 'bn' ? 'থামুন' : 'Stop'}
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 6h12v12H6z" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {surahVerses.length} verses
                  </span>
                </div>
              </div>

              {/* Translator Selector */}
              {availableTranslators.length > 1 && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {lang === 'bn' ? 'অনুবাদক:' : 'Translator:'}
                  </span>
                  <select
                    value={selectedTranslator}
                    onChange={(e) => {
                      const slug = e.target.value;
                      setSelectedTranslator(slug);
                      if (selectedSurah) {
                        loadSurah(selectedSurah, lang, slug);
                      }
                    }}
                    className="text-sm bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 capitalize"
                  >
                    {availableTranslators.map((slug) => (
                      <option key={slug} value={slug}>
                        {slug}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-6">
                {surahVerses.map((v, i) => {
                  const isPlayingThis = isAudioPlaying && currentAudio?.surah === v.surah && currentAudio?.ayah === v.ayah;
                  return (
                    <div
                      key={`${v.id}-${v.translator_slug}-${i}`}
                      id={`verse-${v.surah}-${v.ayah}`}
                      ref={(el) => { verseRefs.current[`${v.surah}-${v.ayah}`] = el; }}
                      className={clsx(
                        'rounded-xl p-5 transition-all',
                        isPlayingThis
                          ? 'bg-teal-50/50 dark:bg-teal-900/10 border-2 border-teal-300 dark:border-teal-700 shadow-md'
                          : 'bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800'
                      )}
                    >
                      <div className="flex items-center justify-between mb-3">
                         <div className="flex items-center gap-2">
                           <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 rounded-full">
                             {v.surah}:{v.ayah}
                           </span>
                           <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">
                             {v.translator_slug}
                           </span>
                         </div>
                        <button
                          onClick={() => playAudio({ surah: v.surah, ayah: v.ayah, autoPlay: false })}
                          className={`p-2 rounded-full transition-colors ${
                            isPlayingThis
                              ? 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-400'
                              : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-zinc-700'
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
                         className="text-lg font-arabic text-gray-900 dark:text-white leading-relaxed mb-3"
                         dir="rtl"
                       >
                         {v.text_ar}
                       </p>
                       <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{v.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && results === null && hadithResults === null && surahVerses === null && (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
               <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                 {searchDomain === 'hadith'
                   ? (lang === 'bn' ? 'হাদিস অনুসন্ধান' : 'Search Hadith')
                   : (lang === 'bn' ? 'কুরআন অনুসন্ধান' : 'Search the Quran')}
               </h3>
               <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto text-sm">
                {searchDomain === 'hadith'
                  ? (lang === 'bn' ? 'বিষয় বা কীওয়ার্ড দিয়ে হাদিস খুঁজুন' : 'Search by topic, keyword, or use @hadith prefix')
                  : (lang === 'bn'
                    ? 'সূরা নাম, আয়াত রেফারেন্স, বা কীওয়ার্ড দিয়ে খুঁজুন'
                    : 'Type a topic like "mercy", "prayer", or "patience" to find relevant verses.')}
              </p>            </div>
          )}

          {/* No results — Quran */}
          {!loading && searchMode && searchDomain === 'quran' && results !== null && results.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 text-sm">
                {lang === 'bn'
                  ? 'কোনো আয়াত পাওয়া যায়নি। অন্য কীওয়ার্ড দিয়ে চেষ্টা করুন।'
                  : 'No verses found. Try different keywords or check that the database is seeded.'}
                </p>
              </div>
            )}

            {/* Hadith Results */}
            {!loading && searchMode && searchDomain === 'hadith' && hadithResults !== null && hadithResults.length > 0 && (
              <div className="space-y-3 px-4 pb-6">
                {hadithResults.map((h, i) => (
                  <div
                    key={`${h.id}-${i}`}
                    className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] font-semibold px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                        {h.book_name_en ?? h.book_name_ar}
                      </span>
                      <span className="text-[11px] text-gray-400 dark:text-gray-500">#{h.num_in_book}</span>
                    </div>
                    {h.matn_ar && (
                      <p className="text-right font-arabic text-base leading-loose text-gray-800 dark:text-gray-200 mb-2" dir="rtl">
                        {h.matn_ar}
                      </p>
                    )}
                    {h.matn_en && (
                      <p
                        className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed border-t border-amber-200 dark:border-amber-800/40 pt-2 mt-2"
                        dangerouslySetInnerHTML={{ __html: highlightTerms(h.matn_en, query) }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* No results — Hadith */}
            {!loading && searchMode && searchDomain === 'hadith' && hadithResults !== null && hadithResults.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 text-sm">
                  {lang === 'bn'
                    ? 'কোনো হাদিস পাওয়া যায়নি। অন্য কীওয়ার্ড দিয়ে চেষ্টা করুন।'
                    : 'No hadith found. Try different keywords.'}
                </p>
              </div>
            )}

        </div>
      </main>

      <ChatWidget lang={lang} onNavigateToVerse={handleNavigateToVerse} />
    </div>
  );
}
