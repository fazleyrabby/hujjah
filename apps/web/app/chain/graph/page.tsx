'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { AppNav } from '@hujjah/ui';
import type { NarratorNode, NarratorEdge } from '@hujjah/ui';
import dynamic from 'next/dynamic';

const NarratorGraph = dynamic(() => import('@hujjah/ui').then(m => ({ default: m.NarratorGraph })), { ssr: false });

type Lang = 'en' | 'bn' | 'ar';

const GRAPH_I18N = {
  en: {
    back: '← Back to Chain Explorer',
    loading: 'Loading network...',
    notFound: 'Narrator not found',
    notFoundDesc: 'Go back to search for a narrator.',
    networkTitle: (name: string) => `${name} — 2-Hop Network`,
    networkMeta: (n: number, e: number) => `${n} narrators · ${e} transmission links`,
  },
  bn: {
    back: '← চেইন এক্সপ্লোরারে ফিরুন',
    loading: 'নেটওয়ার্ক লোড হচ্ছে...',
    notFound: 'রাবী পাওয়া যায়নি',
    notFoundDesc: 'ফিরে গিয়ে রাবী খুঁজুন।',
    networkTitle: (name: string) => `${name} — ২-স্তর নেটওয়ার্ক`,
    networkMeta: (n: number, e: number) => `${n} জন রাবী · ${e}টি সনদ সংযোগ`,
  },
  ar: {
    back: '← العودة إلى مستكشف الإسناد',
    loading: 'جاري تحميل الشبكة...',
    notFound: 'لم يتم العثور على الراوي',
    notFoundDesc: 'ارجع للبحث عن راوٍ.',
    networkTitle: (name: string) => `${name} — شبكة درجتين`,
    networkMeta: (n: number, e: number) => `${n} راوٍ · ${e} رابطاً في الإسناد`,
  },
};

function GraphPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [narrator, setNarrator] = useState<NarratorNode | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: NarratorNode[]; edges: NarratorEdge[] } | null>(null);

  const t = GRAPH_I18N[lang];

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('hujjah-dark');
    if (saved) setDarkMode(saved === 'true');
    const savedLang = localStorage.getItem('hujjah-lang') as Lang | null;
    if (savedLang && ['en', 'bn', 'ar'].includes(savedLang)) setLang(savedLang);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('hujjah-dark', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) return;

    setLoading(true);
    Promise.all([
      fetch(`/api/chain?action=narrator&id=${id}`).then(r => r.json()),
      fetch(`/api/chain?action=graph&id=${id}&depth=2`).then(r => r.json()),
    ])
      .then(([n, g]) => {
        setNarrator(n);
        setGraphData(g);
      })
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

  const displayName = narrator
    ? (lang === 'bn' ? (narrator.name_bn ?? narrator.name_en ?? narrator.name_ar)
      : lang === 'ar' ? narrator.name_ar
      : (narrator.name_en ?? narrator.name_ar))
    : '';

  return (
    <div className={clsx('min-h-screen bg-base', darkMode && 'dark')}>
      <header className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 sticky top-0 z-50">
        <AppNav
          lang={lang}
          onLangChange={(l) => handleLangChange(l as Lang)}
          langs={[{ code: 'en', label: 'EN' }, { code: 'bn', label: 'বাং' }]}
          darkMode={darkMode}
          onDarkModeToggle={() => setDarkMode((d) => !d)}
          containerClass="max-w-none"
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
          {displayName && (
            <h1 className="text-sm font-semibold text-gray-900 dark:text-white truncate" dir="auto">
              {t.networkTitle(displayName)}
            </h1>
          )}
          {graphData && (
            <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
              {t.networkMeta(graphData.nodes.length, graphData.edges.length)}
            </span>
          )}
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-zinc-950 transition-all overflow-hidden relative rounded-2xl border border-gray-200 dark:border-zinc-800 w-full" style={{ minHeight: 'calc(100vh - 9.5rem)' }}>
        {loading && (
          <div className="flex items-center justify-center flex-1">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-500 dark:text-gray-400">{t.loading}</span>
            </div>
          </div>
        )}

        {!loading && !narrator && (
          <div className="flex items-center justify-center flex-1">
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{t.notFound}</p>
              <button
                onClick={() => router.push('/chain')}
                className="mt-2 text-sm text-teal-600 dark:text-teal-400 hover:underline"
              >
                {t.notFoundDesc}
              </button>
            </div>
          </div>
        )}

        {!loading && narrator && graphData && (
          <NarratorGraph
            nodes={graphData.nodes}
            edges={graphData.edges}
            centerId={narrator.id}
            darkMode={darkMode}
            lang={lang}
            onNodeClick={handleNodeClick}
            width={window.innerWidth}
            height={window.innerHeight - 200}
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