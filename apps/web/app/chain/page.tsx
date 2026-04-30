'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { AppNav, useTheme } from '@hujjah/ui';
import type { NarratorNode, NarratorEdge } from '@hujjah/ui';
import SettingsDropdown from '@/components/SettingsDropdown';

type Lang = 'en' | 'bn' | 'ar';

interface HadithChain {
  hadith_id: number;
  book_name_ar: string;
  book_name_en: string | null;
  num_in_book: number;
  matn_ar: string;
  hadith_ar: string;
  matn_en: string | null;
  matn_bn: string | null;
  chain: NarratorNode[];
}

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
      'Hit "View Network" for a full-screen 2-hop graph',
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
      '"নেটওয়ার্ক দেখুন" বাটনে চাপলে ফুল-স্ক্রিন গ্রাফ আসবে',
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
      'انقر "عرض الشبكة" لرؤية رسم بياني كامل الشاشة',
    ],
    tryTitle: 'جرّب هؤلاء الرواة',
  },
};

const RELIABILITY_COLORS: Record<string, string> = {
  thiqah:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  saduq:   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  daif:    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  mawdu:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  unknown: 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-500',
};

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
  'Bukhara': { en: 'Bukhara', bn: 'বোখারা', ar: 'بخارى' },
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
  // DB stores some cities in Bengali — map directly to en
  'বসরা': { en: 'Basra', bn: 'বসরা', ar: 'البصرة' },
  'মদিনা': { en: 'Medina', bn: 'মদিনা', ar: 'المدينة المنورة' },
  'মক্কা': { en: 'Mecca', bn: 'মক্কা', ar: 'مكة المكرمة' },
  'কুফা': { en: 'Kufa', bn: 'কুফা', ar: 'الكوفة' },
  'বাগদাদ': { en: 'Baghdad', bn: 'বাগদাদ', ar: 'بغداد' },
  'দামেশক': { en: 'Damascus', bn: 'দামেশক', ar: 'دمشق' },
  'মিশর': { en: 'Egypt', bn: 'মিশর', ar: 'مصر' },
  'ইয়েমেন': { en: 'Yemen', bn: 'ইয়েমেন', ar: 'اليمن' },
  'সিরিয়া': { en: 'Syria', bn: 'সিরিয়া', ar: 'الشام' },
  'বোখারা': { en: 'Bukhara', bn: 'বোখারা', ar: 'بخارى' },
  'সামারকান্দ': { en: 'Samarkand', bn: 'সামারকান্দ', ar: 'سمرقند' },
  'নিশাপুর': { en: 'Nishapur', bn: 'নিশাপুর', ar: 'نيسابور' },
  'সানা': { en: "Sana'a", bn: 'সানা', ar: 'صنعاء' },
  'বালখ': { en: 'Balkh', bn: 'বালখ', ar: 'بلخ' },
  'মার্ভ': { en: 'Merv', bn: 'মার্ভ', ar: 'مرو' },
  'ওয়াসিত': { en: 'Wasit', bn: 'ওয়াসিত', ar: 'واسط' },
  'রেয়': { en: 'Rayy', bn: 'রেয়', ar: 'ري' },
  'হাররান': { en: 'Harran', bn: 'হাররান', ar: 'حران' },
  'ইয়ামামা': { en: 'Yamama', bn: 'ইয়ামামা', ar: 'يمامة' },
  'খোরাসান': { en: 'Khorasan', bn: 'খোরাসান', ar: 'خراسان' },
};

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

function getNarratorLocalName(node: NarratorNode, lang: Lang): string | null {
  if (lang === 'bn') return node.name_bn ?? node.name_en ?? null;
  if (lang === 'ar') return null;
  return node.name_en ?? null;
}

function effectiveReliability(node: NarratorNode): string | null {
  if (node.reliability) return node.reliability;
  if (node.tabaqah === 1) return 'thiqah';
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
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ChainContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NarratorNode[]>([]);
  const [selectedNarrator, setSelectedNarrator] = useState<NarratorNode | null>(null);
  const [edges, setEdges] = useState<{ teachers: NarratorEdge[]; students: NarratorEdge[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const { darkMode, toggleDarkMode, fontSize, setFontSize } = useTheme();
  const [selectedEdge, setSelectedEdge] = useState<NarratorEdge | null>(null);
  const [edgeHadith, setEdgeHadith] = useState<HadithChain[]>([]);
  const [hadithChainData, setHadithChainData] = useState<{ hadith: any; chain: NarratorNode[] } | null>(null);
  const [selectedFullHadith, setSelectedFullHadith] = useState<any | null>(null);
  const [showAllTeachers, setShowAllTeachers] = useState(false);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [containerClass, setContainerClass] = useState('max-w-5xl');
  const [arabicFont, setArabicFont] = useState('uthmani');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hadithListRef = useRef<HTMLDivElement>(null);

  const t = CHAIN_I18N[lang];
  const isRtl = lang === 'ar';

  useEffect(() => {
    setMounted(true);
    const savedLang = localStorage.getItem('hujjah-lang') as Lang | null;
    if (savedLang && ['en', 'bn', 'ar'].includes(savedLang)) setLang(savedLang);
    const savedFont = localStorage.getItem('hujjah-font-size');
    const scale = savedFont === 'small' ? '0.875' : savedFont === 'large' ? '1.125' : '1';
    document.documentElement.style.setProperty('--font-scale', scale);
    const layout = localStorage.getItem('hujjah-layout');
    if (layout === 'compact') setContainerClass('max-w-3xl');

    const params = new URLSearchParams(window.location.search);
    const nId = params.get('id');
    const hId = params.get('hadith');

    if (nId) {
      setLoading(true);
      fetch(`/api/chain?action=narrator&id=${nId}`)
        .then(r => r.json())
        .then(async (n) => {
          if (n) {
            setSelectedNarrator(n);
            setQuery(n.name_ar ?? '');
            const res = await fetch(`/api/chain?action=edges&id=${n.id}`);
            setEdges(await res.json());
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }

    if (hId) {
      setLoading(true);
      fetch(`/api/chain?action=hadithChain&id=${hId}`)
        .then(r => r.json())
        .then(setHadithChainData)
        .catch(console.error)
        .finally(() => setLoading(false));
    }

    const savedArabicFont = localStorage.getItem('hujjah-arabic-font');
    if (savedArabicFont) setArabicFont(savedArabicFont);
    const savedLang2 = localStorage.getItem('hujjah-lang');
    if (savedLang2) setLang(savedLang2 as Lang);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedFullHadith(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleLangChange = (l: Lang) => {
    setLang(l);
    localStorage.setItem('hujjah-lang', l);
  };

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/chain?action=search&q=${encodeURIComponent(q)}&limit=20`);
      const rows = await res.json();
      setResults(rows);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectNarrator = async (n: NarratorNode) => {
    setSelectedNarrator(n);
    setResults([]);
    setQuery(n.name_ar || '');
    setSelectedEdge(null);
    setEdgeHadith([]);
    setShowAllTeachers(false);
    setShowAllStudents(false);
    router.push(`/chain?id=${n.id}`);
    try {
      const res = await fetch(`/api/chain?action=edges&id=${n.id}`);
      const e = await res.json();
      setEdges(e);
    } catch (err) {
      console.error('Failed to load edges:', err);
    }
  };

  const handleSelectEdge = async (edge: NarratorEdge) => {
    setSelectedEdge(edge);
    setLoading(true);
    try {
      const res = await fetch(`/api/chain?action=hadithsForEdge&from=${edge.from_narrator_id}&to=${edge.to_narrator_id}&limit=10`);
      const hadith = await res.json();
      setEdgeHadith(hadith);
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

  if (!mounted) return null;

  return (
    <div className={clsx('min-h-screen bg-base', darkMode && 'dark')}>
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-3 py-2 flex items-center justify-between">
          <AppNav
            icon={<img src="/hujjah.png" alt="Hujjah" className="w-5 h-5" />}
            lang={lang}
            onLangChange={(l) => handleLangChange(l as Lang)}
            langs={[{ code: 'en', label: 'EN' }, { code: 'bn', label: 'বাং' }]}
            darkMode={darkMode}
            onDarkModeToggle={toggleDarkMode}
            containerClass=""
            hiddenRoutes={['/chat']}
          />
          <SettingsDropdown
            isOpen={settingsOpen}
            onToggle={() => setSettingsOpen(!settingsOpen)}
            lang={lang}
            onLangChange={(l) => handleLangChange(l as Lang)}
            fontSize={fontSize}
            onFontSizeChange={(size) => setFontSize(size as 'small' | 'medium' | 'large')}
            arabicFont={arabicFont}
            onArabicFontChange={(font) => setArabicFont(font)}
            darkMode={darkMode}
            onDarkModeToggle={toggleDarkMode}
            setIsOpen={setSettingsOpen}
            onMoreSettingsClick={() => setSettingsOpen(false)}
          />
        </div>
      </header>

      {/* ── Hadith Chain View ─────────────────── */}
      {hadithChainData && hadithChainData.hadith && (
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          {/* Hadith header */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-white bg-teal-600 px-2 py-0.5 rounded">
                  {hadithChainData.hadith.book_name_en || hadithChainData.hadith.book_name_ar}
                </span>
                <span className="text-sm text-gray-500 font-mono">
                  #{hadithChainData.hadith.num_in_book}
                </span>
                {hadithChainData.hadith.matn_en && (
                  <span className="ml-auto text-xs text-gray-400">
                    {lang === 'bn' ? 'AI অনুবাদ উপলব্ধ' : 'AI translation available'}
                  </span>
                )}
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Arabic text */}
              <p className="font-arabic text-xl leading-loose text-gray-900 dark:text-white text-right" dir="rtl">
                {cleanHadithText(hadithChainData.hadith.hadith_ar || hadithChainData.hadith.matn_ar)}
              </p>
              {/* Translation */}
              {(hadithChainData.hadith.matn_en || hadithChainData.hadith.matn_bn) && (
                <div className="bg-teal-50/30 dark:bg-teal-900/10 p-4 rounded-xl border border-teal-100/50 dark:border-teal-900/20">
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {lang === 'bn' ? (hadithChainData.hadith.matn_bn || hadithChainData.hadith.matn_en) : (hadithChainData.hadith.matn_en || hadithChainData.hadith.matn_bn)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Chain */}
          {hadithChainData.chain.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50">
                <h2 className="font-bold text-gray-900 dark:text-white">
                  {lang === 'bn' ? 'সনদ শৃঙ্খল' : 'Sanad Chain'}
                </h2>
              </div>
              <div className="p-6">
                <div className="space-y-2">
                  {hadithChainData.chain.map((n: NarratorNode, i: number) => (
                    <div key={n.id} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-gray-400 w-6 text-right">{i + 1}</span>
                      <div className="flex-1 flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {getNarratorName(n, lang)}
                          </p>
                          {getNarratorLocalName(n, lang) && (
                            <p className="text-xs text-gray-500">{getNarratorLocalName(n, lang)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          {n.death_year && (
                            <span className="font-mono">{n.death_year} {t.ah}</span>
                          )}
                          {n.city && (
                            <span className="px-2 py-0.5 bg-gray-200 dark:bg-zinc-700 rounded text-xs">
                              {getCityLabel(n.city, lang)}
                            </span>
                          )}
                          <a
                            href={`/chain?id=${n.id}`}
                            className="text-teal-600 hover:text-teal-700 font-medium text-xs"
                          >
                            →
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Prophet */}
                  <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-zinc-700">
                    <span className="text-xs font-mono text-gray-400 w-6 text-right">{hadithChainData.chain.length + 1}</span>
                    <div className="flex-1 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                      <p className="font-medium text-emerald-800 dark:text-emerald-300">
                        {lang === 'bn' ? 'রাসূলুল্লাহ সাল্লাল্লাহু আলাইহি ওয়াসাল্লাম' : 'Prophet Muhammad ﷺ'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {hadithChainData.chain.length === 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-center">
              <p className="text-amber-800 dark:text-amber-300">
                {lang === 'bn' ? 'এই হাদিসের সনদ তথ্য পাওয়া যায়নি।' : 'No chain data available for this hadith.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Narrator Explorer ───────────────── */}
      {!hadithChainData && selectedNarrator && (
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          {/* Narrator profile */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-zinc-800">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {getNarratorName(selectedNarrator, lang)}
              </h2>
              {getNarratorLocalName(selectedNarrator, lang) && (
                <p className="text-sm text-gray-500 mt-1">{getNarratorLocalName(selectedNarrator, lang)}</p>
              )}
            </div>
            <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              {selectedNarrator.death_year && (
                <div>
                  <p className="text-xs text-gray-500 uppercase">{t.died}</p>
                  <p className="font-mono font-medium text-gray-900 dark:text-white">{selectedNarrator.death_year} {t.ah}</p>
                </div>
              )}
              {selectedNarrator.birth_year && (
                <div>
                  <p className="text-xs text-gray-500 uppercase">{t.born}</p>
                  <p className="font-mono font-medium text-gray-900 dark:text-white">{selectedNarrator.birth_year} {t.ah}</p>
                </div>
              )}
              {selectedNarrator.city && (
                <div>
                  <p className="text-xs text-gray-500 uppercase">City</p>
                  <p className="font-medium text-gray-900 dark:text-white">{getCityLabel(selectedNarrator.city, lang)}</p>
                </div>
              )}
              {effectiveReliability(selectedNarrator) && (
                <div>
                  <p className="text-xs text-gray-500 uppercase">Status</p>
                  <span className={clsx('inline-block px-2 py-0.5 rounded text-xs font-medium', RELIABILITY_COLORS[effectiveReliability(selectedNarrator)!])}>
                    {t.reliability[effectiveReliability(selectedNarrator)!] || effectiveReliability(selectedNarrator)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Teachers & Students */}
          {edges && (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Teachers */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50">
                  <h3 className="font-bold text-gray-900 dark:text-white">{t.teachers}</h3>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {(showAllTeachers ? edges.teachers : edges.teachers.slice(0, 5)).map((e) => (
                    <button
                      key={`${e.from_narrator_id}-${e.to_narrator_id}`}
                      onClick={() => handleSelectEdge(e)}
                      className="w-full px-6 py-3 text-left hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                          {getEdgeNarratorName(e, 'to', lang)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t.hadithCount(e.hadith_count)}
                        </p>
                      </div>
                      <span className="text-gray-400">→</span>
                    </button>
                  ))}
                  {edges.teachers.length > 5 && !showAllTeachers && (
                    <button
                      onClick={() => setShowAllTeachers(true)}
                      className="w-full px-6 py-3 text-center text-teal-600 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                    >
                      {lang === 'bn' ? `আরো ${edges.teachers.length - 5} জন দেখুন` : `Show ${edges.teachers.length - 5} more`}
                    </button>
                  )}
                </div>
              </div>

              {/* Students */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50">
                  <h3 className="font-bold text-gray-900 dark:text-white">{t.students}</h3>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {(showAllStudents ? edges.students : edges.students.slice(0, 5)).map((e) => (
                    <button
                      key={`${e.from_narrator_id}-${e.to_narrator_id}`}
                      onClick={() => handleSelectEdge(e)}
                      className="w-full px-6 py-3 text-left hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                          {getEdgeNarratorName(e, 'from', lang)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t.hadithCount(e.hadith_count)}
                        </p>
                      </div>
                      <span className="text-gray-400">←</span>
                    </button>
                  ))}
                  {edges.students.length > 5 && !showAllStudents && (
                    <button
                      onClick={() => setShowAllStudents(true)}
                      className="w-full px-6 py-3 text-center text-teal-600 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                    >
                      {lang === 'bn' ? `আরো ${edges.students.length - 5} জন দেখুন` : `Show ${edges.students.length - 5} more`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Hadiths for selected edge */}
          {edgeHadith.length > 0 && (
            <div ref={hadithListRef} className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50">
                <h3 className="font-bold text-gray-900 dark:text-white">
                  {t.hadithLabel(
                    getNarratorName({ id: selectedEdge?.from_narrator_id, name_ar: selectedEdge?.from_name, name_en: selectedEdge?.from_name_en } as NarratorNode, lang),
                    getNarratorName({ id: selectedEdge?.to_narrator_id, name_ar: selectedEdge?.to_name, name_en: selectedEdge?.to_name_en } as NarratorNode, lang)
                  )}
                </h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-zinc-800">
                {edgeHadith.map((h, i) => (
                  <button
                    key={`${h.hadith_id}-${i}`}
                    onClick={() => setSelectedFullHadith(h)}
                    className="w-full px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-bold text-teal-600 bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 rounded whitespace-nowrap">
                        {h.book_name_en || h.book_name_ar} #{h.num_in_book}
                      </span>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 flex-1">
                        {cleanHadithText(h.matn_en || h.matn_bn || h.matn_ar)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Graph button */}
          <div className="flex justify-center">
            <button
              onClick={handleShowGraph}
              className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition-colors"
            >
              {t.showGraph}
            </button>
          </div>
        </div>
      )}

      {/* ── Empty / Search state ── */}
      {!hadithChainData && !selectedNarrator && !loading && (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{t.heading}</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8">{t.subtitle}</p>
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={t.placeholder}
              className="w-full px-4 py-3 pl-12 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {/* Results */}
          {results.length > 0 && (
            <div className="mt-4 bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-xl">
              {results.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleSelectNarrator(n)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors border-b border-gray-100 dark:border-zinc-800 last:border-0"
                >
                  <p className="font-medium text-gray-900 dark:text-white">{n.name_ar}</p>
                  {n.name_en && <p className="text-xs text-gray-500">{n.name_en}</p>}
                </button>
              ))}
            </div>
          )}
          {/* Examples */}
          <div className="mt-12">
            <p className="text-xs text-gray-400 uppercase mb-4">{t.tryTitle}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_NARRATORS.slice(0, 4).map((n) => (
                <button
                  key={n.en}
                  onClick={() => { setQuery(n.en); handleSearch(n.en); }}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  {lang === 'bn' ? n.bn : lang === 'ar' ? n.ar : n.en}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hadith Modal */}
      {selectedFullHadith && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedFullHadith(null)}
          />
          <div className="relative bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
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
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-4">
                <p className="font-arabic text-xl leading-loose text-gray-900 dark:text-white text-right" dir="rtl">
                  {cleanHadithText(selectedFullHadith.hadith_ar || selectedFullHadith.matn_ar)}
                </p>
                <div className="h-px bg-gray-100 dark:bg-zinc-800" />
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

export default function ChainPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ChainContent />
    </Suspense>
  );
}
