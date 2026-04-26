'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
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

const NarratorGraph = dynamic(() => import('@/components/NarratorGraph'), { ssr: false });

// ─── i18n ─────────────────────────────────────────────────────────────────────

type Lang = 'en' | 'bn' | 'ar';

const CHAIN_I18N = {
  en: {
    pageTitle: 'Chain Explorer',
    heading: 'Sanad Chain Explorer',
    subtitle: 'Search for a narrator to explore their transmission chains. Covers Kutub al-Sittah (36K hadith).',
    placeholder: 'Search narrator name (Arabic)...',
    showGraph: 'Show Graph (2-hop)',
    teachers: 'Teachers (narrated from)',
    students: 'Students (narrated to)',
    networkTitle: '2-Hop Network',
    networkMeta: (n: number, e: number) => `${n} narrators · ${e} transmission links`,
    hadithCount: (n: number) => `${n} hadith`,
    hadithLabel: (from: string, to: string) => `Hadith: ${from} → ${to}`,
    tabaqahLabels: { 1: 'Sahaba', 2: "Tabi'un", 3: "Tabi' al-Tabi'in", 4: 'Later Scholar' } as Record<number, string>,
    reliability: { thiqah: 'Trustworthy', saduq: 'Truthful', daif: 'Weak', mawdu: 'Fabricated' } as Record<string, string>,
    died: 'Died',
    born: 'Born',
    ah: 'AH',
  },
  bn: {
    pageTitle: 'সনদ এক্সপ্লোরার',
    heading: 'সনদ চেইন এক্সপ্লোরার',
    subtitle: 'একজন রাবীর নাম খুঁজুন এবং তাদের বর্ণনা সূত্র দেখুন। কুতুব আল-সিত্তাহ (৩৬ হাজার হাদিস)।',
    placeholder: 'রাবীর নাম খুঁজুন (আরবি)...',
    showGraph: 'গ্রাফ দেখুন (২-স্তর)',
    teachers: 'শায়খগণ (যাঁদের থেকে বর্ণনা করেছেন)',
    students: 'ছাত্রগণ (যাঁরা বর্ণনা করেছেন)',
    networkTitle: '২-স্তর নেটওয়ার্ক',
    networkMeta: (n: number, e: number) => `${n} জন রাবী · ${e}টি সনদ সংযোগ`,
    hadithCount: (n: number) => `${n} হাদিস`,
    hadithLabel: (from: string, to: string) => `হাদিস: ${from} → ${to}`,
    tabaqahLabels: { 1: 'সাহাবা', 2: 'তাবিঈন', 3: 'তাবে তাবিঈন', 4: 'পরবর্তী আলেম' } as Record<number, string>,
    reliability: { thiqah: 'নির্ভরযোগ্য', saduq: 'সত্যবাদী', daif: 'দুর্বল', mawdu: 'জাল' } as Record<string, string>,
    died: 'মৃত্যু',
    born: 'জন্ম',
    ah: 'হি.',
  },
  ar: {
    pageTitle: 'مستكشف الإسناد',
    heading: 'مستكشف سلسلة الإسناد',
    subtitle: 'ابحث عن راوٍ لاستكشاف سلاسل روايته. يشمل الكتب الستة (٣٦ ألف حديث).',
    placeholder: 'ابحث عن اسم الراوي...',
    showGraph: 'عرض الشبكة (درجتان)',
    teachers: 'الشيوخ (روى عنهم)',
    students: 'التلاميذ (رووا عنه)',
    networkTitle: 'شبكة درجتين',
    networkMeta: (n: number, e: number) => `${n} راوٍ · ${e} رابطاً في الإسناد`,
    hadithCount: (n: number) => `${n} حديث`,
    hadithLabel: (from: string, to: string) => `الحديث: ${from} ← ${to}`,
    tabaqahLabels: { 1: 'صحابة', 2: 'تابعون', 3: 'تابع التابعين', 4: 'علماء متأخرون' } as Record<number, string>,
    reliability: { thiqah: 'ثقة', saduq: 'صدوق', daif: 'ضعيف', mawdu: 'موضوع' } as Record<string, string>,
    died: 'وفاة',
    born: 'ولادة',
    ah: 'هـ',
  },
};

// ─── Reliability badge colors ─────────────────────────────────────────────────

const RELIABILITY_COLORS: Record<string, string> = {
  thiqah: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  saduq:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  daif:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  mawdu:  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

// ─── City labels ──────────────────────────────────────────────────────────────

const CITY_LABELS: Record<string, { en: string; bn: string; ar: string }> = {
  'Medina': { en: 'Medina', bn: 'মদিনা', ar: 'المدينة المنورة' },
  'Mecca': { en: 'Mecca', bn: 'মক্কা', ar: 'مكة المكرمة' },
  'Basra': { en: 'Basra', bn: 'বসরা', ar: 'البصرة' },
  'Kufa': { en: 'Kufa', bn: 'কুফা', ar: 'الكوفة' },
  'Baghdad': { en: 'Baghdad', bn: 'বাগদাদ', ar: 'بغداد' },
  'Damascus': { en: 'Damascus', bn: 'দামেস্ক', ar: 'دمشق' },
  'Egypt': { en: 'Egypt', bn: 'মিশর', ar: 'مصر' },
  'Yemen': { en: 'Yemen', bn: 'ইয়েমেন', ar: 'اليمن' },
  'Syria': { en: 'Syria', bn: 'সিরিয়া', ar: 'الشام' },
  'Bukhara': { en: 'Bukhara', bn: 'বুখারা', ar: 'بخارى' },
  'Samarkand': { en: 'Samarkand', bn: 'সামারকান্দ', ar: 'سمرقند' },
  'Nishapur': { en: 'Nishapur', bn: 'নিশাপুর', ar: 'نيسابور' },
  'Sanaa': { en: "Sana'a", bn: 'সানা', ar: 'صنعاء' },
  'Balkh': { en: 'Balkh', bn: 'বালখ', ar: 'بلخ' },
  'Merv': { en: 'Merv', bn: 'মার্ভ', ar: 'مرو' },
  'Wasit': { en: 'Wasit', bn: 'ওয়াসিত', ar: 'واسط' },
  'Rayy': { en: 'Rayy', bn: 'রেয়', ar: 'ري' },
  'Harran': { en: 'Harran', bn: 'হাররান', ar: 'حران' },
  'Yamama': { en: 'Yamama', bn: 'ইয়ামামা', ar: 'يمامة' },
  'Khorasan': { en: 'Khorasan', bn: 'খোরাসান', ar: 'خراسان' },
};

function getCityLabel(city: string | null | undefined, lang: Lang): string {
  if (!city) return '';
  const mapped = CITY_LABELS[city];
  if (mapped) return mapped[lang] || mapped.en;
  return city;
}

function getNarratorName(node: NarratorNode, lang: Lang): string {
  if (lang === 'bn') return node.name_bn ?? node.name_en ?? node.name_ar;
  if (lang === 'ar') return node.name_ar;
  return node.name_en ?? node.name_ar;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChainPage() {
  const [mounted, setMounted] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
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

  const t = CHAIN_I18N[lang];
  const isRtl = lang === 'ar';

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('hujjah-dark');
    if (saved) setDarkMode(saved === 'true');
    const savedLang = localStorage.getItem('hujjah-chain-lang') as Lang | null;
    if (savedLang && ['en', 'bn', 'ar'].includes(savedLang)) setLang(savedLang);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('hujjah-dark', String(darkMode));
  }, [darkMode]);

  const handleLangChange = (l: Lang) => {
    setLang(l);
    localStorage.setItem('hujjah-chain-lang', l);
  };

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }
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
            <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t.pageTitle}</h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <div className="flex items-center rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden text-xs font-medium">
              {(['en', 'bn', 'ar'] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => handleLangChange(l)}
                  className={clsx(
                    'px-2.5 py-1.5 transition-colors',
                    lang === l
                      ? 'bg-teal-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
                  )}
                >
                  {l === 'en' ? 'EN' : l === 'bn' ? 'বাং' : 'عرب'}
                </button>
              ))}
            </div>

            {/* Dark mode toggle */}
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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2" dir={isRtl ? 'rtl' : 'ltr'}>
            {t.heading}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4" dir={isRtl ? 'rtl' : 'ltr'}>
            {t.subtitle}
          </p>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={t.placeholder}
              className="w-full px-5 py-3.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow text-base shadow-sm"
              dir="rtl"
            />
            {loading && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {results.length > 0 && (
            <div className="mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
              {results.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleSelectNarrator(n)}
                  className="w-full px-4 py-3 text-right border-b border-gray-100 dark:border-zinc-800 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                  dir={isRtl ? 'rtl' : 'ltr'}
                >
                  <div className="text-sm text-gray-900 dark:text-white">{n.name_ar}</div>
                  {lang !== 'ar' && (
                    <div className="text-xs text-gray-400 mt-0.5 text-left">
                      {getNarratorName(n, lang)}
                      {n.death_year ? ` · ${t.died} ${n.death_year} ${t.ah}` : ''}
                      {n.data_source ? ` · (${n.data_source})` : ''}
                    </div>
                  )}
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
              <div className="flex items-start justify-between mb-4 gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white" dir="rtl">
                    {selectedNarrator.name_ar}
                  </h3>
                  {lang !== 'ar' && selectedNarrator.name_en && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{getNarratorName(selectedNarrator, lang)}</p>
                  )}
                </div>
                <button
                  onClick={handleShowGraph}
                  className="px-3 py-1.5 text-xs font-medium bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded-lg border border-teal-100 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors whitespace-nowrap"
                >
                  {t.showGraph}
                </button>
              </div>

              {/* Bio metadata row */}
              {(selectedNarrator.tabaqah || selectedNarrator.death_year || selectedNarrator.reliability || selectedNarrator.city) && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedNarrator.tabaqah && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300">
                      {t.tabaqahLabels[selectedNarrator.tabaqah]}
                    </span>
                  )}
                  {selectedNarrator.death_year && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300">
                      {t.died} {selectedNarrator.death_year} {t.ah}
                    </span>
                  )}
                  {selectedNarrator.reliability && (
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', RELIABILITY_COLORS[selectedNarrator.reliability] ?? 'bg-gray-100 text-gray-700')}>
                      {t.reliability[selectedNarrator.reliability] ?? selectedNarrator.reliability}
                    </span>
                  )}
                  {selectedNarrator.city && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400">
                      📍 {getCityLabel(selectedNarrator.city, lang)}
                    </span>
                  )}
                  {selectedNarrator.data_source && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-gray-500">
                      ({selectedNarrator.data_source})
                    </span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{edges.teachers.length}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{t.teachers}</div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{edges.students.length}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{t.students}</div>
                </div>
              </div>
            </div>

            {/* Graph Mode */}
            {graphMode && graphData && (
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-zinc-800">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t.networkTitle}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {t.networkMeta(graphData.nodes.length, graphData.edges.length)}
                  </p>
                </div>
                <NarratorGraph
                  nodes={graphData.nodes}
                  edges={graphData.edges}
                  centerId={selectedNarrator.id}
                  darkMode={darkMode}
                  onNodeClick={handleSelectNarrator}
                  width={672}
                  height={420}
                />
              </div>
            )}

            {/* Teachers */}
            {edges.teachers.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4" dir={isRtl ? 'rtl' : 'ltr'}>
                  {t.teachers}
                </h4>
                <div className="space-y-2">
                  {edges.teachers.map((e) => (
                    <button
                      key={`t-${e.from_narrator_id}`}
                      onClick={() => handleSelectEdge(e)}
                      className={clsx(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors',
                        selectedEdge?.from_narrator_id === e.from_narrator_id && selectedEdge?.to_narrator_id === e.to_narrator_id
                          ? 'bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800'
                          : 'hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent'
                      )}
                      dir="rtl"
                    >
                      <span className="text-sm text-gray-900 dark:text-white">{e.from_name}</span>
                      <span className="text-xs text-teal-600 dark:text-teal-400 font-medium ml-2">
                        {t.hadithCount(e.hadith_count)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Students */}
            {edges.students.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4" dir={isRtl ? 'rtl' : 'ltr'}>
                  {t.students}
                </h4>
                <div className="space-y-2">
                  {edges.students.map((e) => (
                    <button
                      key={`s-${e.to_narrator_id}`}
                      onClick={() => handleSelectEdge(e)}
                      className={clsx(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors',
                        selectedEdge?.from_narrator_id === e.from_narrator_id && selectedEdge?.to_narrator_id === e.to_narrator_id
                          ? 'bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800'
                          : 'hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent'
                      )}
                      dir="rtl"
                    >
                      <span className="text-sm text-gray-900 dark:text-white">{e.to_name}</span>
                      <span className="text-xs text-teal-600 dark:text-teal-400 font-medium ml-2">
                        {t.hadithCount(e.hadith_count)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Edge Hadith */}
            {selectedEdge && edgeHadith.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                  {t.hadithLabel(selectedEdge.from_name, selectedEdge.to_name)}
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
                              {getNarratorName(n, lang)}
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
