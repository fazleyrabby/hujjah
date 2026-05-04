'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { AppNav, useTheme } from '@hujjah/ui';
import ChainMapView from '@/components/chain-map/ChainMapView';
import SettingsDropdown from '@/components/SettingsDropdown';

type Lang = 'en' | 'bn' | 'ar';

const MAP_I18N = {
  en: {
    back: '← Back to Graph View',
    loading: 'Loading narrator...',
    notFound: 'Narrator not found',
    notFoundDesc: 'Go back and search for a narrator.',
  },
  bn: {
    back: '← গ্রাফ ভিউতে ফিরুন',
    loading: 'রাবী লোড হচ্ছে...',
    notFound: 'রাবী পাওয়া যায়নি',
    notFoundDesc: 'ফিরে গিয়ে রাবী খুঁজুন।',
  },
  ar: {
    back: '← العودة إلى عرض الرسم البياني',
    loading: 'جارٍ تحميل الراوي...',
    notFound: 'لم يتم العثور على الراوي',
    notFoundDesc: 'ارجع للبحث عن راوٍ.',
  },
};

function MapPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { darkMode, toggleDarkMode, fontSize, setFontSize } = useTheme();
  const [lang, setLang] = useState<Lang>('en');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [arabicFont, setArabicFont] = useState('uthmani');
  const [loading, setLoading] = useState(false);
  const [narratorId, setNarratorId] = useState<number | null>(null);

  const t = MAP_I18N[lang];

  useEffect(() => {
    const savedLang = localStorage.getItem('hujjah-lang') as Lang | null;
    if (savedLang && ['en', 'bn', 'ar'].includes(savedLang)) setLang(savedLang);
  }, []);

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setNarratorId(Number(id));
  }, [searchParams]);

  const handleLangChange = (l: Lang) => {
    setLang(l);
    localStorage.setItem('hujjah-lang', l);
  };

  const handleNodeClick = (node: any) => {
    router.push(`/chain?id=${node.id}`);
  };

  if (!narratorId) {
    return (
      <div className={clsx('h-screen flex flex-col bg-base', darkMode && 'dark')}>
        <header className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 shrink-0 z-50">
          <div className="max-w-5xl mx-auto px-3 py-2 flex items-center justify-between">
            <AppNav
              lang={lang}
              onLangChange={(l) => handleLangChange(l as Lang)}
              langs={[{ code: 'en', label: 'EN' }, { code: 'bn', label: 'বাং' }]}
              darkMode={darkMode}
              onDarkModeToggle={toggleDarkMode}
              hiddenRoutes={['/chat']}
              icon={<img src="/hujjah.png" alt="Hujjah" className="w-5 h-5" />}
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
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <p className="text-gray-500 dark:text-gray-400">{t.notFound}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{t.notFoundDesc}</p>
          <button
            onClick={() => router.push('/chain')}
            className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {lang === 'bn' ? 'চেইন এক্সপ্লোরারে যান' : 'Go to Chain Explorer'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('h-screen flex flex-col bg-base', darkMode && 'dark')}>
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 shrink-0 z-50">
        <div className="max-w-5xl mx-auto px-3 py-2 flex items-center justify-between">
          <AppNav
            lang={lang}
            onLangChange={(l) => handleLangChange(l as Lang)}
            langs={[{ code: 'en', label: 'EN' }, { code: 'bn', label: 'বাং' }]}
            darkMode={darkMode}
            onDarkModeToggle={toggleDarkMode}
            hiddenRoutes={['/chat']}
            icon={<img src="/hujjah.png" alt="Hujjah" className="w-5 h-5" />}
          />
          <SettingsDropdown
            isOpen={settingsOpen}
            onToggle={() => setSettingsOpen(!settingsOpen)}
            lang={lang}
            onLangChange={(l) => handleLangChange(l as Lang)}
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

      {/* Sub-nav */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800 px-4 py-2.5 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
          <button
            onClick={() => router.push(`/chain/graph?id=${narratorId}`)}
            className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors whitespace-nowrap flex-shrink-0"
          >
            {t.back}
          </button>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Map View
          </span>
        </div>
      </div>

      {/* Map Canvas */}
      <div className="flex-1 relative">
        <ChainMapView
          initialNarratorId={narratorId}
          lang={lang}
          darkMode={darkMode}
          onNodeClick={handleNodeClick}
        />
      </div>
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <MapPageContent />
    </Suspense>
  );
}
