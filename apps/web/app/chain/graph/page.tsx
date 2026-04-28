'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { AppNav, useTheme, SanadExplorer } from '@hujjah/ui';
import type { NarratorNode, NarratorEdge } from '@hujjah/ui';

type Lang = 'en' | 'bn' | 'ar';

const GRAPH_I18N = {
  en: {
    back: '← Back to Chain Explorer',
    loading: 'Loading sanad...',
    notFound: 'Narrator not found',
    notFoundDesc: 'Go back to search for a narrator.',
  },
  bn: {
    back: '← চেইন এক্সপ্লোরারে ফিরুন',
    loading: 'সনদ লোড হচ্ছে...',
    notFound: 'রাবী পাওয়া যায়নি',
    notFoundDesc: 'ফিরে গিয়ে রাবী খুঁজুন।',
  },
  ar: {
    back: '← العودة إلى مستكشف الإسناد',
    loading: 'جاري تحميل السند...',
    notFound: 'لم يتم العثور على الراوي',
    notFoundDesc: 'ارجع للبحث عن راوٍ.',
  },
};

function GraphPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  const { darkMode, toggleDarkMode } = useTheme();
  const [narratorId, setNarratorId] = useState<number | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: NarratorNode[]; edges: NarratorEdge[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const t = GRAPH_I18N[lang];

  useEffect(() => {
    setMounted(true);
    const savedLang = localStorage.getItem('hujjah-lang') as Lang | null;
    if (savedLang && ['en', 'bn', 'ar'].includes(savedLang)) setLang(savedLang);
  }, []);

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) { setNarratorId(null); return; }
    const numId = Number(id);
    setNarratorId(numId);
    setLoading(true);
    fetch(`/api/chain?action=graph&id=${numId}&depth=2`)
      .then(r => r.json())
      .then(setGraphData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [searchParams]);

  const handleNodeClick = (node: NarratorNode) => {
    router.push(`/chain?id=${node.id}`);
  };

  const handleLangChange = (l: Lang) => {
    setLang(l);
    localStorage.setItem('hujjah-lang', l);
  };

  if (!mounted) return null;

  return (
    <div className={clsx('min-h-screen bg-base', darkMode && 'dark')}>
      <header className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 sticky top-0 z-50">
        <AppNav
          lang={lang}
          onLangChange={(l) => handleLangChange(l as Lang)}
          langs={[{ code: 'en', label: 'EN' }, { code: 'bn', label: 'বাং' }]}
          darkMode={darkMode}
          onDarkModeToggle={toggleDarkMode}
          hiddenRoutes={['/chat']}
        />
      </header>

      <div className="bg-white dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push('/chain')}
            className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors whitespace-nowrap"
          >
            {t.back}
          </button>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !narratorId || !graphData ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500 dark:text-gray-400">{t.notFound}</p>
          </div>
        ) : (
          <SanadExplorer
            nodes={graphData.nodes}
            edges={graphData.edges}
            centerId={narratorId}
            darkMode={darkMode}
            lang={lang}
            onNodeClick={handleNodeClick}
          />
        )}
      </div>
    </div>
  );
}

export default function GraphPageWrap() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <GraphPage />
    </Suspense>
  );
}