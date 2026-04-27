'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { AppNav, LinkedVerseText } from '@hujjah/ui';
import { useQuranAudio } from '@/contexts/AudioContext';
import { clsx } from 'clsx';

interface Surah { id: number; name_ar: string; name_en: string; name_bn: string; }
interface SurahVerse { id: number; surah: number; ayah: number; text_ar: string; text: string; translator_slug: string; }
interface SearchResult {
  type: string; surah: number; surah_name: string; ayah: number;
  text_ar: string; text: string; translator_slug: string; snippet?: string; rank: number; label: string;
}
interface HadithResult {
  id: number; book_id: number; book_name_ar: string; book_name_en: string | null;
  num_in_book: number; hadith_ar: string; matn_ar: string; matn_en: string | null;
  sanad_length: number; rank: number; snippet?: string;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [lang, setLang] = useState('en');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [hadithResults, setHadithResults] = useState<HadithResult[] | null>(null);
  const [randomHadiths, setRandomHadiths] = useState<HadithResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [selectedSurah, setSelectedSurah] = useState<number | null>(null);
  const [surahVerses, setSurahVerses] = useState<SurahVerse[] | null>(null);
  const [availableTranslators, setAvailableTranslators] = useState<string[]>([]);
  const [selectedTranslator, setSelectedTranslator] = useState('');
  const [searchMode, setSearchMode] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [searchDomain, setSearchDomain] = useState<'quran' | 'hadith'>('quran');
  const [latency, setLatency] = useState<number | null>(null);
  const { play: playAudio, pause: pauseAudio, resume: resumeAudio, stop: stopAudio, isPlaying: isAudioPlaying, current: currentAudio } = useQuranAudio();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('hujjah-dark');
    if (saved) setDarkMode(saved === 'true');
    const savedLang = localStorage.getItem('hujjah-lang');
    if (savedLang && ['en', 'bn'].includes(savedLang)) setLang(savedLang);
    const savedFont = localStorage.getItem('hujjah-font-size');
    const scale = savedFont === 'small' ? '0.875' : savedFont === 'large' ? '1.125' : '1';
    document.documentElement.style.setProperty('--font-scale', scale);
    fetch('/api/quran?action=surahs')
      .then(r => r.json()).then(setSurahs).catch(console.error);
    loadSurah(1, savedLang || 'en');

    const onPageshow = (e: PageTransitionEvent) => { if (e.persisted) setMounted(true); };
    window.addEventListener('pageshow', onPageshow);
    return () => window.removeEventListener('pageshow', onPageshow);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('hujjah-dark', String(darkMode));
  }, [darkMode]);

  const loadSurah = useCallback(async (surahId: number, activeLang: string, translatorSlug?: string) => {
    setLoading(true);
    setSearchMode(false);
    setResults(null);
    setError(null);
    try {
      const params = new URLSearchParams({ action: 'verses', surah: String(surahId), lang: activeLang });
      if (translatorSlug) params.set('translator', translatorSlug);
      const [verses, trans] = await Promise.all([
        fetch(`/api/quran?${params}`).then(r => r.json()),
        fetch(`/api/quran?action=translators&surah=${surahId}&lang=${activeLang}`).then(r => r.json()),
      ]);
      setSurahVerses(verses);
      setSelectedSurah(surahId);
      setAvailableTranslators((trans as any[]).map((t: any) => t.translator_slug));
      setSelectedTranslator(translatorSlug ?? verses[0]?.translator_slug ?? '');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  const executeSearch = useCallback(async (searchQuery: string, activeLang: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) { setResults(null); setHadithResults(null); return; }
    setLoading(true); setError(null); setResults(null); setHadithResults(null);
    setLatency(null); setSurahVerses(null); setSelectedSurah(null); setSearchMode(true);
    const start = performance.now();
    try {
      const isHadith = trimmed.toLowerCase().startsWith('@hadith') || searchDomain === 'hadith';
      if (isHadith) {
        const q = trimmed.replace(/^@hadith\s*/i, '');
        const rows = await fetch(`/api/hadith?action=search&q=${encodeURIComponent(q)}&lang=${activeLang}`)
          .then(r => r.json());
        setHadithResults(rows);
      } else {
        const rows = await fetch(`/api/quran?action=search&q=${encodeURIComponent(trimmed)}&lang=${activeLang}`)
          .then(r => r.json());
        setResults(rows);
      }
      setLatency(Math.round(performance.now() - start));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [searchDomain]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => executeSearch(value, lang), 300);
  }, [executeSearch, lang]);

  const handleLangChange = useCallback((newLang: string) => {
    setLang(newLang);
    localStorage.setItem('hujjah-lang', newLang);
    setSelectedTranslator('');
    if (query.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => executeSearch(query, newLang), 150);
    }
    if (selectedSurah) loadSurah(selectedSurah, newLang);
    if (searchDomain === 'hadith' && !query.trim()) {
      fetch(`/api/hadith?action=random&lang=${newLang}`).then(r => r.json()).then(setRandomHadiths).catch(console.error);
    }
  }, [query, selectedSurah, executeSearch, loadSurah, searchDomain]);

  const handleNavigateToVerse = useCallback(async (surah: number, ayah: number) => {
    await loadSurah(surah, lang);
    setTimeout(() => {
      const el = document.getElementById(`verse-${surah}-${ayah}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-teal-500', 'bg-teal-50', 'dark:bg-teal-900/20');
        setTimeout(() => el.classList.remove('ring-2', 'ring-teal-500', 'bg-teal-50', 'dark:bg-teal-900/20'), 3000);
      }
    }, 300);
  }, [loadSurah, lang]);

  const highlightTerms = useCallback((text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text;
    const terms = searchQuery.trim().split(/\s+/).filter(t => t.length > 2);
    if (!terms.length) return text;
    const pattern = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return text.replace(pattern, '<mark class="bg-amber-200 dark:bg-amber-700/60 px-0.5 rounded">$1</mark>');
  }, []);

  if (!mounted) return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className={clsx('min-h-screen bg-white dark:bg-zinc-950 flex transition-colors duration-300', darkMode && 'dark')}>
      {/* Sidebar - desktop: sticky, mobile: fixed overlay */}
      {sidebarOpen && (
        <>
          {/* Mobile overlay backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 z-[55] md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className={clsx(
            'bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800 flex flex-col z-[60]',
            'fixed md:sticky md:top-0 md:h-screen md:w-64',
            'left-0 top-0 h-full w-72 md:w-64 transform transition-transform duration-300',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          )}>
            <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Surahs</h2>
                <p className="text-xs text-gray-400 mt-1">{surahs.length} chapters</p>
              </div>
              <button 
                onClick={() => setSidebarOpen(false)}
                className="md:hidden p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {surahs.map(s => (
                <button key={s.id} onClick={() => loadSurah(s.id, lang)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    selectedSurah === s.id
                      ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-900 dark:text-teal-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800'
                  }`}>
                  <span className="text-xs font-mono text-gray-400 w-6">{s.id}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{lang === 'bn' ? s.name_bn : s.name_en}</p>
                    <p className="text-xs text-gray-400 truncate" dir="rtl">{s.name_ar}</p>
                  </div>
                </button>
              ))}
            </nav>
          </aside>
        </>
      )}

      {/* Main */}
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-50 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
          <header className="border-b border-gray-100 dark:border-zinc-800">
            <AppNav
              lang={lang}
              onLangChange={handleLangChange}
              langs={[{ code: 'en', label: 'EN' }, { code: 'bn', label: 'বাং' }]}
              darkMode={darkMode} onDarkModeToggle={() => setDarkMode(d => !d)}
              hiddenRoutes={['/chat']}
            />
          </header>

          <div className="bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800/60">
            <div className="max-w-3xl mx-auto px-6 py-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
                  {(['quran', 'hadith'] as const).map(d => (
                    <button key={d} type="button"
                      onClick={() => {
                        setSearchDomain(d);
                        if (d === 'hadith') {
                          setResults(null); setSurahVerses(null); setSelectedSurah(null);
                          if (!query.trim()) fetch(`/api/hadith?action=random&lang=${lang}`).then(r => r.json()).then(setRandomHadiths).catch(console.error);
                        } else setRandomHadiths(null);
                      }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                        searchDomain === d
                          ? 'bg-white dark:bg-zinc-700 text-teal-700 dark:text-teal-400 shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}>
                      {d === 'quran' ? (lang === 'bn' ? 'কুরআন' : 'Quran') : (lang === 'bn' ? 'হাদিস' : 'Hadith')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <input type="text" value={query} onChange={e => handleQueryChange(e.target.value)}
                  placeholder={searchDomain === 'hadith'
                    ? (lang === 'bn' ? 'হাদিস অনুসন্ধান...' : 'Search hadith...')
                    : (lang === 'bn' ? 'কুরআন অনুসন্ধান...' : 'Search the Quran...')}
                  className="w-full px-5 py-3.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 text-base shadow-sm"
                />
                {query.trim() && (
                  <button type="button" onClick={() => { setQuery(''); setResults(null); setHadithResults(null); setSurahVerses(null); setSelectedSurah(null); }}
                    className="absolute right-16 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 rounded-md">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <button type="button" disabled={loading || !query.trim()} onClick={() => executeSearch(query, lang)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-gray-900 dark:bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40">
                  {loading ? '...' : lang === 'bn' ? 'খুঁজুন' : 'Search'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg">
              <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Search Results — Quran */}
          {searchMode && results && results.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider">{results.length} results</p>
                {latency !== null && <p className="text-xs text-gray-400">{latency}ms</p>}
              </div>
              <div className="space-y-4">
                {results.map((r, i) => (
<article key={`${r.surah}-${r.ayah}-${i}`}
                    className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 hover:border-teal-200 dark:hover:border-teal-800 transition-all cursor-pointer"
                    onClick={() => loadSurah(r.surah, lang)}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white bg-gray-900 dark:bg-teal-700 px-2 py-0.5 rounded">{r.label}</span>
                        <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 rounded-full">{r.surah}:{r.ayah}</span>
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{r.surah_name}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); playAudio({ surah: r.surah, ayah: r.ayah, autoPlay: false }); }}
                        className="p-1.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                        title="Play audio"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </button>
                    </div>
                    {r.text_ar && <p className="text-lg font-arabic text-gray-900 dark:text-white leading-relaxed mb-3" dir="rtl">{r.text_ar}</p>}
                    {r.snippet ? (
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: r.snippet.replace(/<mark>/g, '<mark class="bg-amber-200 dark:bg-amber-700/60 px-0.5 rounded">') }} />
                    ) : (
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: highlightTerms(r.text, query) }} />
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* Surah reading view */}
          {!loading && !searchMode && surahVerses && selectedSurah && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {lang === 'bn' ? surahs.find(s => s.id === selectedSurah)?.name_bn : surahs.find(s => s.id === selectedSurah)?.name_en}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400" dir="rtl">{surahs.find(s => s.id === selectedSurah)?.name_ar}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {(!isAudioPlaying || currentAudio?.surah !== selectedSurah) && (
                    <button
                      onClick={() => playAudio({ surah: selectedSurah, ayah: 1, autoPlay: true })}
                      className="flex items-center gap-2 px-4 py-2 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 text-sm font-medium rounded-lg border border-teal-100 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
                      title={lang === 'bn' ? 'সূরা প্লে করুন' : 'Play surah'}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      {lang === 'bn' ? 'সূরা শুনুন' : 'Play Surah'}
                    </button>
                  )}
                  {isAudioPlaying && currentAudio?.surah === selectedSurah && (
                    <button
                      onClick={pauseAudio}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm font-medium rounded-lg border border-amber-100 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                      title="Pause"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                      {lang === 'bn' ? 'বিরতি' : 'Pause'}
                    </button>
                  )}
                  {!isAudioPlaying && currentAudio?.surah === selectedSurah && currentAudio && (
                    <button
                      onClick={resumeAudio}
                      className="flex items-center gap-2 px-4 py-2 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 text-sm font-medium rounded-lg border border-teal-100 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
                      title="Resume"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      {lang === 'bn' ? 'আবার শুনুন' : 'Resume'}
                    </button>
                  )}
                  {currentAudio?.surah === selectedSurah && (
                    <button
                      onClick={stopAudio}
                      className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm font-medium rounded-lg border border-red-100 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                      title={lang === 'bn' ? 'থামুন' : 'Stop'}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
                    </button>
                  )}
                  <span className="text-xs text-gray-400">{surahVerses.length} verses</span>
                </div>
              </div>
              {availableTranslators.length > 1 && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">{lang === 'bn' ? 'অনুবাদক:' : 'Translator:'}</span>
                  <select value={selectedTranslator}
                    onChange={e => { setSelectedTranslator(e.target.value); loadSurah(selectedSurah, lang, e.target.value); }}
                    className="text-sm bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 capitalize">
                    {availableTranslators.map(slug => <option key={slug} value={slug}>{slug}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-6">
                {surahVerses.map((v, i) => (
                  <div key={`${v.id}-${i}`} id={`verse-${v.surah}-${v.ayah}`}
                    className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 transition-all">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 rounded-full">{v.surah}:{v.ayah}</span>
                      <span className="text-xs text-gray-400 capitalize">{v.translator_slug}</span>
                      <button
                        onClick={() => playAudio({ surah: v.surah, ayah: v.ayah, autoPlay: false })}
                        className={`p-1 rounded-full transition-colors ${
                          isAudioPlaying && currentAudio?.surah === v.surah && currentAudio?.ayah === v.ayah
                            ? 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-400'
                            : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-zinc-700'
                        }`}
                        title="Play audio"
                      >
                        {isAudioPlaying && currentAudio?.surah === v.surah && currentAudio?.ayah === v.ayah ? (
                          <svg className="w-3.5 h-3.5 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        )}
                      </button>
                    </div>
                    <p className="text-lg font-arabic text-gray-900 dark:text-white leading-relaxed mb-3" dir="rtl">{v.text_ar}</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{v.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && !searchMode && (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 space-y-3 animate-pulse">
                  <div className="h-5 w-24 bg-gray-100 dark:bg-zinc-800 rounded" />
                  <div className="h-8 w-full bg-gray-100 dark:bg-zinc-800 rounded" />
                  <div className="h-12 w-full bg-gray-100 dark:bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && results === null && hadithResults === null && surahVerses === null && (
            <div className="text-center py-20">
              <p className="text-gray-400 text-sm">{lang === 'bn' ? 'কুরআন বা হাদিস অনুসন্ধান করুন' : 'Search the Quran or Hadith above'}</p>
            </div>
          )}

          {/* Hadith search results */}
          {searchMode && hadithResults && hadithResults.length > 0 && (
            <div className="space-y-3">
              {hadithResults.map((h, i) => (
                <div key={`${h.id}-${i}`} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-semibold px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">{h.book_name_en ?? h.book_name_ar}</span>
                    <span className="text-[11px] text-gray-400">#{h.num_in_book}</span>
                  </div>
                  {h.matn_ar && <p className="text-right font-arabic text-base leading-loose text-gray-800 dark:text-gray-200 mb-2" dir="rtl">{h.matn_ar}</p>}
                  {h.matn_en && <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed border-t border-amber-200 dark:border-amber-800/40 pt-2 mt-2" dangerouslySetInnerHTML={{ __html: highlightTerms(h.matn_en, query) }} />}
                </div>
              ))}
            </div>
          )}

          {/* Random hadiths */}
          {!loading && searchDomain === 'hadith' && hadithResults === null && randomHadiths && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">{lang === 'bn' ? 'বাছাই করা হাদিস' : 'Featured Hadith'}</h3>
                <button onClick={() => fetch(`/api/hadith?action=random&lang=${lang}`).then(r => r.json()).then(setRandomHadiths).catch(console.error)}
                  className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {lang === 'bn' ? 'আরও দেখুন' : 'Shuffle'}
                </button>
              </div>
              <div className="space-y-4">
                {randomHadiths.map((h, i) => (
                  <article key={`${h.id}-${i}`} className="bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-800/40 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 rounded-full">{h.book_name_en ?? h.book_name_ar}</span>
                        <span className="text-[11px] text-gray-400">#{h.num_in_book}</span>
                      </div>
                    </div>
                    <p className="text-right font-arabic text-lg leading-loose text-gray-900 dark:text-white mb-3" dir="rtl">{h.matn_ar}</p>
                    {h.matn_en && <div className="border-t border-amber-100 dark:border-amber-800/30 pt-3"><p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{h.matn_en}</p></div>}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Sidebar toggle - floating button */}
      <button onClick={() => setSidebarOpen(v => !v)}
        className={clsx('fixed top-[54px] z-50 flex items-center gap-1 px-2 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 shadow-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all',
          sidebarOpen ? 'left-64 border-l-0 rounded-r-full' : 'left-0 border-l-0 rounded-r-full')}
        title="Toggle surah list">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        {!sidebarOpen && <span className="text-xs">Surahs</span>}
      </button>

    </div>
  );
}
