'use client';

import { useState, useEffect } from 'react';
import { getQuranStats, purgeLegacyStorage } from '@/lib/db';
import { getHadithStats } from '@/lib/hadith-db';
import { getTieredModelPath, detectDeviceTier } from '@/lib/ai/llama';
import AppNav from '@/components/AppNav';

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [lang, setLang] = useState<'en' | 'bn'>('en');
  const [layout, setLayout] = useState<'compact' | 'full'>('full');
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [stats, setStats] = useState({ verses: 0, translations: 0, languages: 0 });
  const [hadithStats, setHadithStats] = useState({ hadith: 0, books: 0, narrators: 0 });
  const [loading, setLoading] = useState(false);
  const [modelPath, setModelPath] = useState('');
  const [deviceTier, setDeviceTier] = useState<'mobile' | 'desktop'>('desktop');

  useEffect(() => {
    setMounted(true);
    const savedDark = localStorage.getItem('hujjah-dark');
    if (savedDark) setDarkMode(savedDark === 'true');
    const savedLang = localStorage.getItem('hujjah-lang');
    if (savedLang && ['en', 'bn'].includes(savedLang)) setLang(savedLang as 'en' | 'bn');
    const savedLayout = localStorage.getItem('hujjah-layout') as 'compact' | 'full' | null;
    if (savedLayout) setLayout(savedLayout);
    const savedFont = localStorage.getItem('hujjah-font-size') as 'small' | 'medium' | 'large' | null;
    if (savedFont) setFontSize(savedFont);
    loadStats();
    getTieredModelPath().then(setModelPath).catch(() => setModelPath('Unknown'));
    detectDeviceTier().then(setDeviceTier).catch(() => setDeviceTier('desktop'));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('hujjah-layout', layout);
  }, [layout, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('hujjah-font-size', fontSize);
    const sizeMap = { small: 'text-sm', medium: 'text-base', large: 'text-lg' };
    document.documentElement.className = document.documentElement.className
      .replace(/text-(sm|base|lg)/g, '')
      .trim();
    document.documentElement.classList.add(sizeMap[fontSize]);
  }, [fontSize, mounted]);

  const loadStats = async () => {
    try {
      const s = await getQuranStats();
      setStats(s);
    } catch (e) {
      console.error('Failed to load Quran stats:', e);
    }
    try {
      const h = await getHadithStats();
      setHadithStats(h);
    } catch (e) {
      console.error('Failed to load Hadith stats:', e);
    }
  };

  const handlePurge = async () => {
    if (!confirm('Purge legacy IndexedDB and reset the Quran database?')) return;
    setLoading(true);
    try {
      await purgeLegacyStorage();
      await loadStats();
      alert('Storage purged and database reset');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert('Error: ' + message);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  const isBn = lang === 'bn';

  return (
    <div className={`min-h-screen bg-base ${darkMode ? 'dark' : ''}`}>
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 sticky top-0 z-50">
        <AppNav
          lang={lang}
          onLangChange={(l) => setLang(l as 'en' | 'bn')}
          langs={[{ code: 'en', label: 'EN' }, { code: 'bn', label: 'বাং' }]}
          darkMode={darkMode}
          onDarkModeToggle={() => setDarkMode((d) => !d)}
          containerClass={layout === 'compact' ? 'max-w-3xl' : 'max-w-5xl'}
        />
      </header>

      <div className={`${layout === 'compact' ? 'max-w-3xl' : 'max-w-5xl'} mx-auto px-6 py-8`}>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
          {isBn ? 'সেটিংস' : 'Settings'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          {isBn ? 'অ্যাপারেন্স, AI মডেল এবং ডেটাবেস কনফিগারেশন' : 'Appearance, AI model, and database configuration'}
        </p>

        {/* ─── Appearance ─── */}
        <section className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {isBn ? 'অ্যাপারেন্স' : 'Appearance'}
          </h2>

          {/* Layout width */}
          <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-zinc-800">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {isBn ? 'লেআউট প্রস্থ' : 'Layout Width'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {layout === 'compact'
                  ? (isBn ? 'সংক্ষিপ্ত (768px)' : 'Compact (768px)')
                  : (isBn ? 'পূর্ণ (1024px)' : 'Full (1024px)')}
              </p>
            </div>
            <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-md p-0.5">
              {(['compact', 'full'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLayout(l)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    layout === l
                      ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                  }`}>
                  {l === 'compact' ? (isBn ? 'সংক্ষিপ্ত' : 'Compact') : (isBn ? 'পূর্ণ' : 'Full')}
                </button>
              ))}
            </div>
          </div>

          {/* Font size */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {isBn ? 'ফন্ট সাইজ' : 'Font Size'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {fontSize === 'small' ? (isBn ? 'ছোট' : 'Small') : fontSize === 'medium' ? (isBn ? 'মাঝারি' : 'Medium') : (isBn ? 'বড়' : 'Large')}
              </p>
            </div>
            <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-md p-0.5">
              {(['small', 'medium', 'large'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFontSize(s)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    fontSize === s
                      ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                  }`}>
                  {s === 'small' ? 'S' : s === 'medium' ? 'M' : 'L'}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ─── AI Model ─── */}
        <section className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {isBn ? 'AI মডেল' : 'AI Model'}
          </h2>

          {/* Current model */}
          <div className="mb-4 p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              {isBn ? 'বর্তমান মডেল' : 'Current Model'}
            </p>
            <p className="text-sm font-mono text-gray-900 dark:text-white break-all">
              {modelPath}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {isBn ? `ডিভাইস টায়ার: ${deviceTier}` : `Device tier: ${deviceTier}`}
            </p>
          </div>

          {/* Model cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 0.5B Mobile */}
            <div className="p-4 border border-gray-200 dark:border-zinc-700 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-white bg-amber-600 px-2 py-0.5 rounded">0.5B</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Qwen2.5-0.5B</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {isBn ? 'মোবাইল ডিভাইসের জন্য (<4GB RAM)' : 'For mobile devices (<4GB RAM)'}
              </p>
              <code className="block text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-zinc-800 p-2 rounded break-all">
                resources/models/qwen-0.5b-q4/qwen2.5-0.5b-instruct-q4_k_m.gguf
              </code>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
                {isBn ? 'মডেলটি ম্যানুয়ালি এই পাথে রাখুন' : 'Place model file manually at this path'}
              </p>
            </div>

            {/* 1.5B Desktop */}
            <div className="p-4 border border-gray-200 dark:border-zinc-700 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-white bg-teal-600 px-2 py-0.5 rounded">1.5B</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Qwen2.5-1.5B</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {isBn ? 'ডেস্কটপ ডিভাইসের জন্য (8GB+ RAM)' : 'For desktop devices (8GB+ RAM)'}
              </p>
              <code className="block text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-zinc-800 p-2 rounded break-all">
                resources/models/qwen-1.5b-q4/qwen2.5-1.5b-instruct-q4_k_m.gguf
              </code>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
                {isBn ? 'মডেলটি ম্যানুয়ালি এই পাথে রাখুন' : 'Place model file manually at this path'}
              </p>
            </div>
          </div>
        </section>

        {/* ─── Database ─── */}
        <section className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {isBn ? 'ডেটাবেস' : 'Database'}
          </h2>

          {/* Quran stats */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              {isBn ? 'কুরআন' : 'Quran'}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg text-center">
                <div className="text-xl font-bold text-gray-900 dark:text-white">{stats.verses.toLocaleString()}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">{isBn ? 'আরবি আয়াত' : 'Arabic verses'}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg text-center">
                <div className="text-xl font-bold text-teal-600 dark:text-teal-400">{stats.translations.toLocaleString()}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">{isBn ? 'অনুবাদ' : 'Translations'}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg text-center">
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats.languages}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">{isBn ? 'ভাষা' : 'Languages'}</div>
              </div>
            </div>
          </div>

          {/* Hadith stats */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              {isBn ? 'হাদিস' : 'Hadith'}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg text-center">
                <div className="text-xl font-bold text-gray-900 dark:text-white">{hadithStats.hadith.toLocaleString()}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">{isBn ? 'হাদিস' : 'Hadiths'}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg text-center">
                <div className="text-xl font-bold text-teal-600 dark:text-teal-400">{hadithStats.books}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">{isBn ? 'বই' : 'Books'}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg text-center">
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{hadithStats.narrators.toLocaleString()}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">{isBn ? 'রাবী' : 'Narrators'}</div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Danger Zone ─── */}
        <section className="bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900/50 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-4">
            {isBn ? 'বিপদজনক এলাকা' : 'Danger Zone'}
          </h2>
          <button
            onClick={handlePurge}
            disabled={loading}
            className="w-full px-4 py-3 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {loading ? (isBn ? 'মুছে ফেলা হচ্ছে...' : 'Purging...') : (isBn ? 'লেগাসি স্টোরেজ মুছে ফেলুন' : 'Purge Legacy & Reset DB')}
          </button>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {isBn
              ? 'পুরানো IndexedDB (PGlite) মুছে ফেলে এবং নেটিভ SQLite কুরআন ডেটাবেস রিসেট করে।'
              : 'Clears old IndexedDB (PGlite) and resets the native SQLite Quran database.'}
          </p>
        </section>
      </div>
    </div>
  );
}
