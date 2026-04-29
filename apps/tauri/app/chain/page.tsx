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

      {/* ── Under Maintenance ────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
        <div className="w-16 h-16 mb-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          {lang === 'bn' ? 'রক্ষণাবেক্ষণ চলছে' : 'Under Maintenance'}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md leading-relaxed">
          {lang === 'bn'
            ? 'সনদ চেইন ডেটা আমদানি চলছে। sunnah.com API থেকে প্রতিদিন ৪,৭০০টি হাদিসের সনদ সংগ্রহ করা হচ্ছে। শীঘ্রই পুনরায় উপলব্ধ হবে।'
            : 'Narrator chain data is being imported from the sunnah.com API (4,700 hadiths/day). The Chain Explorer will be available again once the import is complete.'}
        </p>
        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
          {lang === 'bn' ? 'আনুমানিক সম্পূর্ণ: ৯ দিন' : 'Estimated completion: ~9 days'}
        </p>
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
