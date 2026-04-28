'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  searchNarrators,
  getNarratorEdges,
  getHadithsForEdge,
  getHadithChain,
  type NarratorNode,
  type NarratorEdge,
  type HadithChain,
} from '@/lib/chain-db';
import { clsx } from 'clsx';
import { AppNav } from '@hujjah/ui';

// ─── i18n ─────────────────────────────────────────────────────────────────────

type Lang = 'en' | 'bn' | 'ar';

const CHAIN_I18N = {
  en: {
    pageTitle: 'Chain Explorer',
    heading: 'Sanad Chain Explorer',
    subtitle: 'Search for a narrator to explore their transmission chains. Covers Kutub al-Sittah (36K hadith).',
    placeholder: 'Search narrator (Arabic or English)...',
    showGraph: 'View Network (2-hop)',
    teachers: 'Teachers (narrated from)',
    students: 'Students (narrated to)',
    networkTitle: '2-Hop Network',
    networkMeta: (n: number, e: number) => `${n} narrators · ${e} transmission links`,
    hadithCount: (n: number) => `${n} hadith`,
    hadithLabel: (from: string, to: string) => `Hadith: ${from} → ${to}`,
    tabaqahLabels: { 1: 'Sahaba', 2: "Tabi'un", 3: "Tabi' al-Tabi'in", 4: 'Later Scholar' } as Record<number, string>,
    reliability: { thiqah: 'Trustworthy', saduq: 'Truthful', daif: 'Weak', mawdu: 'Fabricated', unknown: 'Not Rated' } as Record<string, string>,
    died: 'Died',
    born: 'Born',
    ah: 'AH',
    howToTitle: 'How to explore',
    howToSteps: [
      'Type a narrator name in Arabic or English above',
      'Select from the dropdown to see their profile',
      'Click any teacher or student to see shared hadith',
      'Hit "Show Graph" for a visual 2-hop network',
    ],
    tryTitle: 'Try these narrators',
  },
  bn: {
    pageTitle: 'সনদ এক্সপ্লোরার',
    heading: 'সনদ চেইন এক্সপ্লোরার',
    subtitle: 'একজন রাবীর নাম খুঁজুন এবং তাদের বর্ণনা সূত্র দেখুন। কুতুব আল-সিত্তাহ (৩৬ হাজার হাদিস)।',
    placeholder: 'রাবীর নাম খুঁজুন (আরবি বা ইংরেজি)...',
    showGraph: 'নেটওয়ার্ক দেখুন (২-স্তর)',
    teachers: 'শায়খগণ (যাঁদের থেকে বর্ণনা করেছেন)',
    students: 'ছাত্রগণ (যাঁরা বর্ণনা করেছেন)',
    networkTitle: '২-স্তর নেটওয়ার্ক',
    networkMeta: (n: number, e: number) => `${n} জন রাবী · ${e}টি সনদ সংযোগ`,
    hadithCount: (n: number) => `${n} হাদিস`,
    hadithLabel: (from: string, to: string) => `হাদিস: ${from} → ${to}`,
    tabaqahLabels: { 1: 'সাহাবা', 2: 'তাবিঈন', 3: 'তাবে তাবিঈন', 4: 'পরবর্তী আলেম' } as Record<number, string>,
    reliability: { thiqah: 'নির্ভরযোগ্য', saduq: 'সত্যবাদী', daif: 'দুর্বল', mawdu: 'জাল', unknown: 'মূল্যায়ন নেই' } as Record<string, string>,
    died: 'মৃত্যু',
    born: 'জন্ম',
    ah: 'হি.',
    howToTitle: 'কীভাবে ব্যবহার করবেন',
    howToSteps: [
      'উপরের বক্সে আরবি বা ইংরেজিতে রাবীর নাম লিখুন',
      'ড্রপডাউন থেকে রাবী বেছে নিন — প্রোফাইল দেখাবে',
      'শায়খ বা ছাত্রের নামে ক্লিক করলে সনদসহ হাদিস দেখাবে',
      '"গ্রাফ দেখুন" বাটনে চাপলে ২-স্তর নেটওয়ার্ক ভিজুয়াল আসবে',
    ],
    tryTitle: 'এই রাবীদের দিয়ে শুরু করুন',
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
    reliability: { thiqah: 'ثقة', saduq: 'صدوق', daif: 'ضعيف', mawdu: 'موضوع', unknown: 'غير مُقيَّم' } as Record<string, string>,
    died: 'وفاة',
    born: 'ولادة',
    ah: 'هـ',
    howToTitle: 'كيفية الاستخدام',
    howToSteps: [
      'اكتب اسم الراوي بالعربية في الأعلى',
      'اختر من القائمة لعرض ترجمته',
      'انقر على شيخ أو تلميذ لعرض الأحاديث المشتركة',
      'انقر "عرض الشبكة" لرؤية شبكة درجتين',
    ],
    tryTitle: 'جرّب هؤلاء الرواة',
  },
};

// ─── Reliability badge colors ─────────────────────────────────────────────────

const RELIABILITY_COLORS: Record<string, string> = {
  thiqah:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  saduq:   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  daif:    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  mawdu:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  unknown: 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-500',
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

// ─── Example narrators for quick-start chips ─────────────────────────────────

const EXAMPLE_NARRATORS = [
  { ar: 'أَبِي هُرَيْرَةَ',   en: 'Abu Hurayra',      bn: 'আবু হুরাইরা' },
  { ar: 'عَائِشَةَ',          en: 'Aisha',            bn: 'আয়িশা' },
  { ar: 'الزُّهْرِيِّ',       en: 'al-Zuhri',         bn: 'আল-জুহরী' },
  { ar: 'شُعْبَةُ',           en: 'Shuba',            bn: 'শুবা' },
  { ar: 'سُفْيَانُ',         en: 'Sufyan',           bn: 'সুফিয়ান' },
  { ar: 'ابْنِ عَبَّاسٍ',     en: 'Ibn Abbas',        bn: 'ইবনে আব্বাস' },
  { ar: 'قَتَادَةَ',          en: 'Qatada',           bn: 'কাতাদা' },
  { ar: 'وَكِيعٌ',            en: 'Waki',             bn: 'উকী' },
];

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

/** Returns EN or BN name only if it actually exists (not Arabic fallback). */
function getNarratorLocalName(node: NarratorNode, lang: Lang): string | null {
  if (lang === 'bn') return node.name_bn ?? node.name_en ?? null;
  if (lang === 'ar') return null;
  return node.name_en ?? null;
}

/**
 * Determine effective reliability.
 * Sahaba (tabaqah=1) are universally considered thiqah in hadith sciences.
 * Returns null when genuinely unknown.
 */
function effectiveReliability(node: NarratorNode): string | null {
  if (node.reliability) return node.reliability;
  if (node.tabaqah === 1) return 'thiqah'; // All Sahaba are thiqah
  return null;
}

function getEdgeNarratorName(e: NarratorEdge, type: 'from' | 'to', lang: Lang): string {
  if (type === 'from') {
    if (lang === 'bn') return e.from_name_bn ?? e.from_name_en ?? e.from_name;
    if (lang === 'ar') return e.from_name;
    return e.from_name_en ?? e.from_name;
  } else {
    if (lang === 'bn') return e.to_name_bn ?? e.to_name_en ?? e.to_name;
    if (lang === 'ar') return e.to_name;
    return e.to_name_en ?? e.to_name;
  }
}

function cleanHadithText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '') // Strip all <TAGS>
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChainPage() {
  const router = useRouter();
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
  const [hadithChainData, setHadithChainData] = useState<{ hadith: any; chain: NarratorNode[] } | null>(null);
  const [selectedFullHadith, setSelectedFullHadith] = useState<any | null>(null);
  const [showAllTeachers, setShowAllTeachers] = useState(false);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [containerClass, setContainerClass] = useState('max-w-5xl');
  const [searchLoading, setSearchLoading] = useState(false);
  const hadithListRef = useRef<HTMLDivElement>(null);
  const isSearching = useRef(false);

  const t = CHAIN_I18N[lang];
  const isRtl = lang === 'ar';

  useEffect(() => {
    setMounted(true);
    const onPageshow = (e: PageTransitionEvent) => {
      if (e.persisted) setMounted(true);
    };
    window.addEventListener('pageshow', onPageshow);
    const saved = localStorage.getItem('hujjah-dark');
    if (saved) setDarkMode(saved === 'true');
    const savedFont = localStorage.getItem('hujjah-font-size');
    const scale = savedFont === 'small' ? '0.875' : savedFont === 'large' ? '1.125' : '1';
    document.documentElement.style.setProperty('--font-scale', scale);
    const savedLang = localStorage.getItem('hujjah-chain-lang') as Lang | null;
    if (savedLang && ['en', 'bn', 'ar'].includes(savedLang)) setLang(savedLang);
    const layout = localStorage.getItem('hujjah-layout');
    if (layout === 'compact') setContainerClass('max-w-3xl');

    // Check for URL params on initial load
    const params = new URLSearchParams(window.location.search);
    const nId = params.get('id');
    const hId = params.get('hadith');

    if (nId) {
      setLoading(true);
      import('@/lib/chain-db').then(({ getNarratorById, getNarratorEdges }) => {
        getNarratorById(Number(nId))
          .then(async (n) => {
            if (n) {
              setSelectedNarrator(n);
              setQuery(n.name_ar ?? '');
              const e = await getNarratorEdges(n.id);
              setEdges(e);
            }
          })
          .catch(console.error)
          .finally(() => setLoading(false));
      });
    }

    if (hId && !hadithChainData) {
      setLoading(true);
      getHadithChain(Number(hId))
        .then(setHadithChainData)
        .catch(console.error)
        .finally(() => setLoading(false));
    }

    return () => {
      window.removeEventListener('pageshow', onPageshow);
      setHadithChainData(null);
      setSelectedNarrator(null);
      setEdges(null);
      setSelectedEdge(null);
      setEdgeHadith([]);
      setResults([]);
      setLoading(false);
    };
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedFullHadith(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
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
    if (isSearching.current) return;
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }
    setSearchLoading(true);
    isSearching.current = true;
    try {
      const rows = await searchNarrators(q, 20);
      setResults(rows);
    } finally {
      setSearchLoading(false);
      isSearching.current = false;
    }
  };

  const handleSelectNarrator = async (n: NarratorNode) => {
    setSelectedNarrator(n);
    setResults([]);
    setQuery(n.name_ar);
    setSelectedEdge(null);
    setEdgeHadith([]);
    setShowAllTeachers(false);
    setShowAllStudents(false);
    router.push(`/chain?id=${n.id}`);
    setLoading(true);
    try {
      const e = await getNarratorEdges(n.id);
      setEdges(e);
    } catch (err) {
      console.error('Failed to load edges:', err);
      setEdges({ teachers: [], students: [] });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEdge = async (edge: NarratorEdge) => {
    setSelectedEdge(edge);
    setLoading(true);
    try {
      const hadith = await getHadithsForEdge(edge.from_narrator_id, edge.to_narrator_id, 10);
      setEdgeHadith(hadith);
      // Scroll to hadith list after render
      setTimeout(() => {
        hadithListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } finally {
      setLoading(false);
    }
  };

  const handleShowGraph = () => {
    if (!selectedNarrator) return;
    router.push(`/chain/graph?id=${selectedNarrator.id}`);
  };

  if (!mounted) return <div className="min-h-screen bg-white dark:bg-zinc-950" />;

  return (
    <div className={clsx('min-h-screen bg-base', darkMode && 'dark')}>
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 sticky top-0 z-50">
        <AppNav
          lang={lang}
          onLangChange={(l) => handleLangChange(l as Lang)}
          langs={[{ code: 'en', label: 'EN' }, { code: 'bn', label: 'বাং' }]}
          darkMode={darkMode}
          onDarkModeToggle={() => setDarkMode((d) => !d)}
          containerClass={containerClass}
          hiddenRoutes={['/chat']}
        />
      </header>

      <div className={`${containerClass} mx-auto px-6 py-8`}>
        {/* Data Quality Notice */}
        <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <span className="font-medium">Note:</span> Chain data is extracted from hadith position sequences. Some connections may be inaccurate due to parallel chain storage or missing death years.
          </p>
        </div>

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
              dir="auto"
            />
            {loading && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {results.length > 0 && (
            <div className="mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
              {results.map((n, i) => (
                <button
                  key={`${n.id}-${i}`}
                  onClick={() => handleSelectNarrator(n)}
                  className="w-full px-4 py-3 text-right border-b border-gray-100 dark:border-zinc-800 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                  dir={isRtl ? 'rtl' : 'ltr'}
                >
                  <div className="text-sm text-gray-900 dark:text-white">{n.name_ar}</div>
                  {lang !== 'ar' && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 text-left">
                      {getNarratorName(n, lang)}
                      {n.death_year ? ` · ${t.died} ${n.death_year} ${t.ah}` : ''}
                      {n.data_source === 'computed' ? ' · name only' : n.data_source ? ` · ${n.data_source}` : ''}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Hadith Chain View (Linear Sanad) */}
          {hadithChainData && !selectedNarrator && results.length === 0 && (
            <div className="mt-8 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="bg-white dark:bg-zinc-900 border border-teal-200 dark:border-teal-800/50 rounded-2xl shadow-sm overflow-hidden">
                {/* Hadith Header */}
                <div className="bg-teal-50/50 dark:bg-teal-900/10 px-6 py-4 border-b border-teal-100 dark:border-teal-800/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-teal-700 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/40 px-2 py-0.5 rounded">
                        {hadithChainData.hadith.book_name_en || hadithChainData.hadith.book_name_ar}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">#{hadithChainData.hadith.num_in_book}</span>
                    </div>
                    <button 
                      onClick={() => setHadithChainData(null)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed font-arabic text-right mb-2" dir="rtl">
                    {hadithChainData.hadith.matn_ar}
                  </p>
                  <div className="flex items-center justify-between gap-4 mt-2 pt-2 border-t border-teal-100/50 dark:border-teal-800/20">
                    {(lang === 'en' ? hadithChainData.hadith.matn_en : hadithChainData.hadith.matn_bn) ? (
                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed flex-1">
                        {lang === 'en' ? hadithChainData.hadith.matn_en : (hadithChainData.hadith.matn_bn || hadithChainData.hadith.matn_en)}
                      </p>
                    ) : <div className="flex-1" />}
                    <button
                      onClick={() => setSelectedFullHadith(hadithChainData.hadith)}
                      className="flex-shrink-0 text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:underline uppercase tracking-wider"
                    >
                      {lang === 'bn' ? 'সম্পূর্ণ হাদিস' : 'Full Hadith'}
                    </button>
                  </div>
                </div>

                {/* Vertical Sanad */}
                <div className="px-6 py-8 relative">
                  {/* Connecting Line */}
                  <div className="absolute left-[2.25rem] top-8 bottom-8 w-0.5 bg-gradient-to-b from-teal-500/50 to-teal-500/10" />

                  <div className="space-y-6">
                    {hadithChainData.chain.map((n, i) => (
                      <div key={`chain-${n.id}-${i}`} className="relative flex gap-4 group">
                        {/* Timeline Marker */}
                        <div className="relative z-10 flex-shrink-0 w-10 h-10 rounded-full bg-white dark:bg-zinc-900 border-2 border-teal-500 flex items-center justify-center text-teal-600 dark:text-teal-400 font-bold text-sm shadow-sm group-hover:scale-110 transition-transform">
                          {i + 1}
                        </div>

                        {/* Narrator Card */}
                        <button
                          onClick={() => handleSelectNarrator(n)}
                          className="flex-1 text-left p-4 rounded-xl border border-gray-100 dark:border-zinc-800 hover:border-teal-300 dark:hover:border-teal-700 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-all shadow-sm group-hover:shadow-md"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h5 className="font-arabic text-base text-gray-900 dark:text-white" dir="rtl">{n.name_ar}</h5>
                              {(() => {
                                const localName = getNarratorLocalName(n, lang);
                                return localName ? (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{localName}</p>
                                ) : null;
                              })()}
                            </div>
                            {(() => {
                              const rel = effectiveReliability(n);
                              const key = rel ?? 'unknown';
                              return (
                                <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0', RELIABILITY_COLORS[key] || 'bg-gray-100')}>
                                  {t.reliability[key] || key}
                                  {!n.reliability && n.tabaqah === 1 && ' ✦'}
                                </span>
                              );
                            })()}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {n.tabaqah && (
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 border border-gray-100 dark:border-zinc-800 px-1.5 py-0.5 rounded">
                                {t.tabaqahLabels[n.tabaqah]}
                              </span>
                            )}
                            {n.death_year && (
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 border border-gray-100 dark:border-zinc-800 px-1.5 py-0.5 rounded">
                                {t.died} {n.death_year} {t.ah}
                              </span>
                            )}
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Guide — shown only before any narrator is selected */}
          {!selectedNarrator && results.length === 0 && !query && !hadithChainData && (
            <div className="mt-6 space-y-5">
              {/* How-to steps */}
              <div className="bg-teal-50 dark:bg-teal-900/10 border border-teal-100 dark:border-teal-800/40 rounded-xl p-4">
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wide mb-3">
                  {t.howToTitle}
                </p>
                <ol className="space-y-2">
                  {t.howToSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Example narrator chips */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2.5">
                  {t.tryTitle}
                </p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_NARRATORS.map((n) => (
                    <button
                      key={n.en}
                      onClick={() => handleSearch(n.en)}
                      className="group flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg hover:border-teal-400 dark:hover:border-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/10 transition-colors text-left"
                    >
                      <span className="text-sm font-medium text-gray-900 dark:text-white" dir="rtl">{n.ar}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 group-hover:text-teal-600 dark:group-hover:text-teal-400">
                        {lang === 'bn' ? n.bn : n.en}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
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
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', RELIABILITY_COLORS[selectedNarrator.reliability] ?? 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300')}>
                      {t.reliability[selectedNarrator.reliability] ?? selectedNarrator.reliability}
                    </span>
                  )}
                  {selectedNarrator.city && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400">
                      📍 {getCityLabel(selectedNarrator.city, lang)}
                    </span>
                  )}
                  {selectedNarrator.data_source && selectedNarrator.data_source !== 'computed' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-gray-500">
                      ({selectedNarrator.data_source})
                    </span>
                  )}
                </div>
              )}

              {selectedNarrator.data_source === 'computed' && (
                <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300">
                  <span>⚠️</span>
                  <span>No biographical data available — name-only record derived from hadith chains.</span>
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

            {/* Teachers */}
            {edges.teachers.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white" dir={isRtl ? 'rtl' : 'ltr'}>
                    {t.teachers}
                  </h4>
                  {edges.teachers.length > 8 && (
                    <button
                      onClick={() => setShowAllTeachers(!showAllTeachers)}
                      className="text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors uppercase tracking-wider"
                    >
                      {showAllTeachers ? (lang === 'bn' ? 'সংক্ষেপ করুন' : 'Show Less') : (lang === 'bn' ? `সব দেখুন (${edges.teachers.length})` : `Show All (${edges.teachers.length})`)}
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {(showAllTeachers ? edges.teachers : edges.teachers.slice(0, 8)).map((e, i) => (
                    <button
                      key={`t-${e.to_narrator_id}-${i}`}
                      onClick={() => handleSelectEdge(e)}
                      className={clsx(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors',
                        selectedEdge?.from_narrator_id === e.from_narrator_id && selectedEdge?.to_narrator_id === e.to_narrator_id
                          ? 'bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800'
                          : 'hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent'
                      )}
                      dir="rtl"
                    >
                      <div className="flex flex-col text-right">
                        <span className="text-sm text-gray-900 dark:text-white">{e.to_name}</span>
                        {lang !== 'ar' && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{getEdgeNarratorName(e, 'to', lang)}</span>
                        )}
                      </div>
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
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white" dir={isRtl ? 'rtl' : 'ltr'}>
                    {t.students}
                  </h4>
                  {edges.students.length > 8 && (
                    <button
                      onClick={() => setShowAllStudents(!showAllStudents)}
                      className="text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors uppercase tracking-wider"
                    >
                      {showAllStudents ? (lang === 'bn' ? 'সংক্ষেপ করুন' : 'Show Less') : (lang === 'bn' ? `সব দেখুন (${edges.students.length})` : `Show All (${edges.students.length})`)}
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {(showAllStudents ? edges.students : edges.students.slice(0, 8)).map((e, i) => (
                    <button
                      key={`s-${e.from_narrator_id}-${i}`}
                      onClick={() => handleSelectEdge(e)}
                      className={clsx(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors',
                        selectedEdge?.from_narrator_id === e.from_narrator_id && selectedEdge?.to_narrator_id === e.to_narrator_id
                          ? 'bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800'
                          : 'hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent'
                      )}
                      dir="rtl"
                    >
                      <div className="flex flex-col text-right">
                        <span className="text-sm text-gray-900 dark:text-white">{e.from_name}</span>
                        {lang !== 'ar' && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{getEdgeNarratorName(e, 'from', lang)}</span>
                        )}
                      </div>
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
              <div ref={hadithListRef} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                  {t.hadithLabel(selectedEdge.from_name, selectedEdge.to_name)}
                </h4>
                <div className="space-y-4">
                  {edgeHadith.map((h, i) => (
                    <div key={`edge-h-${h.hadith_id}-${i}`} className="border-b border-gray-100 dark:border-zinc-800 last:border-0 pb-4 last:pb-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-white bg-gray-900 dark:bg-teal-700 px-2 py-0.5 rounded">
                          {h.book_name_en || h.book_name_ar}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">#{h.num_in_book}</span>
                      </div>
                      {/* Chain */}
                      <div className="flex flex-wrap items-center gap-1 mb-2">
                        {h.chain.map((n, ci) => (
                          <span key={`node-${n.id}-${ci}`} className="flex items-center gap-1">
                            <span className="text-xs text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 rounded-full">
                              {getNarratorName(n, lang)}
                            </span>
                            {ci < h.chain.length - 1 && (
                              <span className="text-gray-400 dark:text-gray-600">→</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2" dir="rtl">
                        {h.matn_ar}
                      </p>
                      <button
                        onClick={() => setSelectedFullHadith(h)}
                        className="text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:underline uppercase tracking-wider"
                      >
                        {lang === 'bn' ? 'সম্পূর্ণ হাদিস পড়ুন' : 'Read Full Hadith'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
                <span className="text-xs font-bold text-white bg-teal-600 px-2 py-0.5 rounded">
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
                <div className="h-px bg-gray-100 dark:bg-zinc-800" />
                
                {/* Translations */}
                <div className="space-y-4">
                  {(selectedFullHadith.matn_en || selectedFullHadith.matn_bn) && (
                    <div className="bg-teal-50/30 dark:bg-teal-900/5 p-4 rounded-xl border border-teal-100/50 dark:border-teal-900/10">
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                        {lang === 'bn' ? (selectedFullHadith.matn_bn || selectedFullHadith.matn_en) : (selectedFullHadith.matn_en || selectedFullHadith.matn_bn)}
                      </p>
                    </div>
                  )}
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
