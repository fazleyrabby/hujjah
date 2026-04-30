'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { AppNav, useTheme } from '@hujjah/ui';
import SettingsDropdown from '@/components/SettingsDropdown';

const ITEMS_PER_PAGE = 20;


interface TranslatorOption {
  id: 'sunnah' | 'qwen';
  label: string;
  description: string;
}

const TRANSLATORS: TranslatorOption[] = [
  { id: 'sunnah', label: 'Classic', description: 'Traditional translations' },
  { id: 'qwen', label: 'AI', description: 'Modern AI translations' },
];

interface HadithBook {
  id: number;
  name_ar: string;
  name_en: string | null;
  hadith_count: number;
}

interface HadithResult {
  id: number;
  book_id: number;
  book_name_ar: string;
  book_name_en: string | null;
  num_in_book: number;
  hadith_ar: string;
  matn_ar: string;
  matn_en: string | null;
  sanad_length: number;
  rank: number;
  snippet?: string;
  translations?: {
    qwen?: string | null;
    sunnah?: string | null;
    hadith_api?: string | null;
  };
}

interface HadithPageResult {
  hadiths: HadithResult[];
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
}

function getHadithGrade(sanadLength: number): { label: string; color: string; description: string } {
  if (sanadLength <= 3) {
    return {
      label: 'Sahih',
      color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
      description: 'Short chain - highly authentic',
    };
  } else if (sanadLength <= 5) {
    return {
      label: 'Hasan',
      color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
      description: 'Medium chain - good authenticity',
    };
  } else {
    return {
      label: 'Standard',
      color: 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400',
      description: 'Longer chain - standard grading',
    };
  }
}

function cleanHadithText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function HadithPage() {
  const [mounted, setMounted] = useState(false);
  const { darkMode, toggleDarkMode, fontSize, setFontSize } = useTheme();
  const [lang, setLang] = useState<'en' | 'bn'>('en');
  const [translator, setTranslator] = useState<'sunnah' | 'qwen'>('sunnah');
  const [books, setBooks] = useState<HadithBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<number | null>(null);
  const [hadithData, setHadithData] = useState<HadithPageResult | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HadithResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedFullHadith, setSelectedFullHadith] = useState<HadithResult | null>(null);
  const [containerClass, setContainerClass] = useState('max-w-5xl');
  const [arabicFont, setArabicFont] = useState('uthmani');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('hujjah-arabic-font');
    if (saved) setArabicFont(saved);
    const savedLang = localStorage.getItem('hujjah-lang');
    if (savedLang && ['en', 'bn'].includes(savedLang)) setLang(savedLang as 'en' | 'bn');
    const savedFont = localStorage.getItem('hujjah-font-size');
    const scale = savedFont === 'small' ? '0.875' : savedFont === 'large' ? '1.125' : '1';
    document.documentElement.style.setProperty('--font-scale', scale);
  }, []);

  useEffect(() => {
    setMounted(true);
    fetch('/api/hadith?action=books')
      .then(r => r.json())
      .then((data: HadithBook[]) => {
        const SITTAH = new Set([1688, 1689, 1648, 2014, 1652, 1444]);
        setBooks(data.sort((a, b) => {
          const aSittah = SITTAH.has(a.id) ? 0 : 1;
          const bSittah = SITTAH.has(b.id) ? 0 : 1;
          if (aSittah !== bSittah) return aSittah - bSittah;
          return b.hadith_count - a.hadith_count;
        }));
      })
      .catch(console.error);
    const layout = localStorage.getItem('hujjah-layout');
    if (layout === 'compact') setContainerClass('max-w-3xl');

    const onPageshow = (e: PageTransitionEvent) => { if (e.persisted) setMounted(true); };
    window.addEventListener('pageshow', onPageshow);
    return () => window.removeEventListener('pageshow', onPageshow);
  }, []);

  useEffect(() => {
    localStorage.setItem('hujjah-lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('hujjah-arabic-font', arabicFont);
  }, [arabicFont]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedFullHadith(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const loadBook = useCallback(async (bookId: number, page: number) => {
    setLoading(true);
    setSearchQuery('');
    setSearchResults(null);
    try {
      const res = await fetch(`/api/hadith?action=byBook&bookId=${bookId}&page=${page}&perPage=${ITEMS_PER_PAGE}&lang=${lang}`);
      const data = await res.json();
      setHadithData(data);
      setCurrentPage(page);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    if (selectedBook !== null) {
      loadBook(selectedBook, 1);
    }
  }, [selectedBook, lang, loadBook]);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/hadith?action=search&q=${encodeURIComponent(q)}&lang=${lang}&limit=50`);
      const results = await res.json();
      setSearchResults(results);
    } catch (err) {
      console.error(err);
    } finally {
      setSearchLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch(searchQuery);
      } else {
        setSearchResults(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-base dark:bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading Hadith...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base dark:bg-[#0a0a0a]">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-3 py-2 flex items-center justify-between">
          <AppNav
            icon={<img src="/hujjah.png" alt="Hujjah" className="w-5 h-5" />}
            lang={lang}
            onLangChange={(l) => setLang(l as 'en' | 'bn')}
            langs={[{ code: 'en', label: 'EN' }, { code: 'bn', label: 'বাং' }]}
            darkMode={darkMode}
            onDarkModeToggle={toggleDarkMode}
            hiddenRoutes={['/chat']}
          />
          <SettingsDropdown
            isOpen={settingsOpen}
            onToggle={() => setSettingsOpen(!settingsOpen)}
            lang={lang}
            onLangChange={(l) => setLang(l as 'en' | 'bn')}
            fontSize={fontSize}
            onFontSizeChange={(size) => {
              setFontSize(size as 'small' | 'medium' | 'large');
              localStorage.setItem('hujjah-font-size', size);
              document.documentElement.style.setProperty('--font-scale', size === 'small' ? '0.875' : size === 'large' ? '1.125' : '1');
            }}
            arabicFont={arabicFont}
            onArabicFontChange={(font) => {
              setArabicFont(font);
              localStorage.setItem('hujjah-arabic-font', font);
            }}
            darkMode={darkMode}
            onDarkModeToggle={toggleDarkMode}
            setIsOpen={setSettingsOpen}
            onMoreSettingsClick={() => setSettingsOpen(false)}
          />
        </div>
      </header>

      <div className={`${containerClass} mx-auto px-6 py-6`}>
        {/* ─── Translator toggle ─── */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-gray-500 dark:text-gray-400">Translation:</span>
          <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-md p-0.5">
            {TRANSLATORS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTranslator(t.id)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded transition-all ${
                  translator === t.id
                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
                title={t.description}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Search ─── */}
        <div className="mb-6">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === 'bn' ? 'হাদিস খুঁজুন... (Arabic or English)' : 'Search hadith... (Arabic or English)'}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400 transition-shadow"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchResults(null); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {searchLoading && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Searching...</p>
          )}
        </div>

        {/* ─── Search Results ─── */}
        {searchResults !== null && (
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {lang === 'bn'
                ? `${searchResults.length} টি হাদিস পাওয়া গেছে`
                : `${searchResults.length} hadith${searchResults.length !== 1 ? 's' : ''} found`}
            </p>
            <div className="space-y-4">
              {searchResults.map((h) => (
                <HadithCard key={`${h.book_id}-${h.num_in_book}`} hadith={h} lang={lang} translator={translator} onViewFull={setSelectedFullHadith} />
              ))}
            </div>
          </div>
        )}

        {/* ─── Book Selector ─── */}
        {searchResults === null && (
          <>
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {lang === 'bn' ? 'কিতাব' : 'Book'}
                </span>
                {selectedBook !== null && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    — {books.find(b => b.id === selectedBook)?.name_en ?? ''}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {books.map((book) => {
                  const short = book.name_en ?? book.name_ar;
                  const isSelected = selectedBook === book.id;
                  const isSittah = [1688, 1689, 1648, 2014, 1652, 1444].includes(book.id);
                  return (
                    <button
                      key={book.id}
                      onClick={() => setSelectedBook(book.id)}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1 text-xs sm:px-4 sm:py-2 sm:text-sm rounded-full border font-medium transition-all whitespace-nowrap ${
                        isSelected
                          ? 'bg-teal-600 dark:bg-teal-500 border-teal-600 dark:border-teal-500 text-white'
                          : isSittah
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:border-amber-400 dark:hover:border-amber-500'
                          : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:border-teal-400 dark:hover:border-teal-600'
                      }`}
                    >
                      {short}
                      <span className={`text-[10px] font-mono ${isSelected ? 'text-teal-100' : isSittah ? 'text-amber-500 dark:text-amber-500' : 'text-gray-400 dark:text-gray-500'}`}>
                        {book.hadith_count >= 1000 ? `${(book.hadith_count / 1000).toFixed(1)}k` : book.hadith_count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─── Hadith Listing ─── */}
            {selectedBook !== null && hadithData !== null && (
              <>
                {/* Book header */}
                {(() => {
                  const book = books.find((b) => b.id === selectedBook);
                  if (!book) return null;
                  return (
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                          {book.name_en ?? book.name_ar}
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-300" dir="rtl">{book.name_ar}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {hadithData.total.toLocaleString()} {lang === 'bn' ? 'হাদিস' : 'hadiths'}
                        </p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">
                          {lang === 'bn'
                            ? `পৃষ্ঠা ${currentPage} / ${hadithData.totalPages}`
                            : `Page ${currentPage} of ${hadithData.totalPages}`}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {loading ? (
                  <div className="text-center py-12">
                    <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      {hadithData.hadiths.map((h) => (
                        <HadithCard key={h.id} hadith={h} lang={lang} translator={translator} onViewFull={setSelectedFullHadith} />
                      ))}
                    </div>

                    {/* ─── Pagination ─── */}
                    {hadithData.totalPages > 1 && (
                      <div className="flex items-center justify-center gap-1 mt-8">
                        <button
                          onClick={() => loadBook(selectedBook, Math.max(1, currentPage - 1))}
                          disabled={currentPage <= 1}
                          className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                        >
                          ←
                        </button>

                        {generatePagination(currentPage, hadithData.totalPages).map((p, i) =>
                          p === '...' ? (
                            <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-gray-400 dark:text-gray-500">…</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => loadBook(selectedBook, Number(p))}
                              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                                currentPage === Number(p)
                                  ? 'bg-teal-600 text-white'
                                  : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800'
                              }`}
                            >
                              {p}
                            </button>
                          )
                        )}

                        <button
                          onClick={() => loadBook(selectedBook, Math.min(hadithData.totalPages, currentPage + 1))}
                          disabled={currentPage >= hadithData.totalPages}
                          className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                        >
                          →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Hadith Modal */}
      {selectedFullHadith && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedFullHadith(null)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-white bg-teal-600 px-2 py-0.5 rounded-full uppercase">
                  {selectedFullHadith.book_name_en || selectedFullHadith.book_name_ar}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">#{selectedFullHadith.num_in_book}</span>
              </div>
              <button 
                onClick={() => setSelectedFullHadith(null)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-full transition-colors text-gray-400"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-4">
                <p className="font-arabic text-xl leading-loose text-gray-900 dark:text-white text-right" dir="rtl">
                  {cleanHadithText(selectedFullHadith.hadith_ar || selectedFullHadith.matn_ar)}
                </p>
                
                {/* Translations */}
                <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
                  {(() => {
                    const trans = translator === 'sunnah'
                      ? (lang === 'bn'
                          ? selectedFullHadith.translations?.hadith_api ?? selectedFullHadith.translations?.sunnah ?? selectedFullHadith.translations?.qwen
                          : selectedFullHadith.translations?.sunnah ?? selectedFullHadith.translations?.qwen)
                      : selectedFullHadith.translations?.qwen ?? (lang === 'bn' ? selectedFullHadith.translations?.hadith_api : selectedFullHadith.translations?.sunnah);
                    
                    if (!trans) return null;
                    return (
                      <div className="bg-teal-50/30 dark:bg-teal-900/5 p-4 rounded-xl border border-teal-100/50 dark:border-teal-900/10">
                        <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                          {trans}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 dark:border-zinc-800 flex justify-end bg-gray-50/50 dark:bg-zinc-800/50">
              <button
                onClick={() => setSelectedFullHadith(null)}
                className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black text-xs font-bold rounded-lg hover:opacity-90 transition-opacity"
              >
                {lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HadithCard({ 
  hadith, 
  lang, 
  translator,
  onViewFull 
}: { 
  hadith: HadithResult; 
  lang: 'en' | 'bn'; 
  translator: 'sunnah' | 'qwen';
  onViewFull: (h: HadithResult) => void;
}) {
  const grade = getHadithGrade(hadith.sanad_length);

  const translation = translator === 'sunnah'
    ? (lang === 'bn'
        ? hadith.translations?.hadith_api ?? hadith.translations?.sunnah ?? hadith.translations?.qwen
        : hadith.translations?.sunnah ?? hadith.translations?.qwen)
    : hadith.translations?.qwen ?? (lang === 'bn' ? hadith.translations?.hadith_api : hadith.translations?.sunnah);

  const arabicText = hadith.matn_ar || hadith.hadith_ar;
  const isLong = arabicText.length > 300 || (translation && translation.length > 400);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[11px] font-semibold px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
          {hadith.book_name_en ?? hadith.book_name_ar}
        </span>
        <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">
          #{hadith.num_in_book}
        </span>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${grade.color}`} title={grade.description}>
          {grade.label}
        </span>
        {hadith.sanad_length > 0 && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500 ml-auto">
            {lang === 'bn' ? 'সনদ:' : 'Sanad:'} {hadith.sanad_length}
          </span>
        )}
      </div>

      <p
        className={clsx(
          "text-right font-arabic text-base leading-loose text-gray-900 dark:text-gray-50 mb-3",
          isLong && "line-clamp-4"
        )}
        dir="rtl"
      >
        {arabicText}
      </p>

      {translation && (
        <p className={clsx(
          "text-sm text-gray-700 dark:text-gray-300 leading-relaxed border-t border-gray-100 dark:border-zinc-800 pt-2 mt-2",
          isLong && "line-clamp-3"
        )}>
          {translation}
        </p>
      )}
      
      {hadith.translations?.sunnah && hadith.translations?.qwen && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
          Translation: {translator === 'sunnah' ? 'Classic' : 'AI'}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-4 border-t border-gray-100 dark:border-zinc-800 pt-3">
        <div className="flex items-center gap-3">
          {hadith.sanad_length > 0 && (
            <Link
              href={`/chain?hadith=${hadith.id}`}
              className="flex items-center gap-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {lang === 'bn' ? 'সনদ দেখুন' : 'View Chain'}
            </Link>
          )}
          {isLong && (
            <button
              onClick={() => onViewFull(hadith)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {lang === 'bn' ? 'সম্পূর্ণ পড়ুন' : 'Read Full'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function generatePagination(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [];

  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, '...', total);
  } else if (current >= total - 3) {
    pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total);
  } else {
    pages.push(1, '...', current - 1, current, current + 1, '...', total);
  }

  return pages;
}
