'use client';

import { useState, useEffect } from 'react';
import { AppNav, useTheme } from '@hujjah/ui';
import SettingsDropdown from '@/components/SettingsDropdown';

const LANG_OPTIONS = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
];

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const { darkMode, toggleDarkMode, fontSize, setFontSize } = useTheme();
  const [layoutWidth, setLayoutWidth] = useState<'compact' | 'full'>('full');
  const [lang, setLang] = useState<'en' | 'bn'>('en');
  const [arabicFont, setArabicFont] = useState('uthmani');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedLayout = localStorage.getItem('hujjah-layout');
    if (savedLayout) setLayoutWidth(savedLayout as 'compact' | 'full');
    const savedLang = localStorage.getItem('hujjah-lang');
    if (savedLang && ['en', 'bn'].includes(savedLang)) setLang(savedLang as 'en' | 'bn');
    const savedArabicFont = localStorage.getItem('hujjah-arabic-font');
    if (savedArabicFont) setArabicFont(savedArabicFont);
    const savedFont = localStorage.getItem('hujjah-font-size');
    const scale = savedFont === 'small' ? '0.875' : savedFont === 'large' ? '1.125' : '1';
    document.documentElement.style.setProperty('--font-scale', scale);

    const onPageshow = (e: PageTransitionEvent) => { if (e.persisted) setMounted(true); };
    window.addEventListener('pageshow', onPageshow);
    return () => window.removeEventListener('pageshow', onPageshow);
  }, []);

  useEffect(() => {
    localStorage.setItem('hujjah-layout', layoutWidth);
  }, [layoutWidth]);

  useEffect(() => {
    localStorage.setItem('hujjah-lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('hujjah-arabic-font', arabicFont);
  }, [arabicFont]);

  const containerClass = layoutWidth === 'compact' ? 'max-w-3xl' : 'max-w-5xl';

  if (!mounted) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <header className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 sticky top-0 z-50 overflow-visible">
        <div className="max-w-5xl mx-auto px-3 py-2 flex items-center justify-between">
          <AppNav
            icon={<img src="/hujjah.png" alt="Hujjah" className="w-5 h-5" />}
            lang={lang}
            onLangChange={(l) => setLang(l as 'en' | 'bn')}
            langs={[{ code: 'en', label: 'EN' }, { code: 'bn', label: 'বাং' }]}
            darkMode={darkMode}
            onDarkModeToggle={toggleDarkMode}
            hiddenRoutes={['/chat']}
            containerClass={containerClass}
          />
          <SettingsDropdown
            isOpen={settingsOpen}
            onToggle={() => setSettingsOpen(!settingsOpen)}
            lang={lang}
            onLangChange={(l) => setLang(l as 'en' | 'bn')}
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

      <div className={`${containerClass} mx-auto px-6 py-10`}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Settings</h1>

        <div className="space-y-6">
          {/* Appearance */}
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              Appearance
            </h2>

            {/* Dark mode */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-zinc-800">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Dark Mode</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Switch between light and dark themes</p>
              </div>
                <button
                onClick={toggleDarkMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  darkMode ? 'bg-teal-600' : 'bg-gray-200 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    darkMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Font size */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-zinc-800">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Font Size</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Adjust text size across the app</p>
              </div>
              <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
                {(['small', 'medium', 'large'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setFontSize(size)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      fontSize === size
                        ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    {size.charAt(0).toUpperCase() + size.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Layout */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Content Width</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Choose between compact or full-width layout</p>
              </div>
              <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
                {(['compact', 'full'] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => setLayoutWidth(w)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      layoutWidth === w
                        ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    {w.charAt(0).toUpperCase() + w.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Language */}
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              Language
            </h2>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Interface Language</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Choose your preferred language for translations</p>
              </div>
              <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
                {LANG_OPTIONS.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLang(l.code as 'en' | 'bn')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      lang === l.code
                        ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    {l.native}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              Preview
            </h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              This paragraph shows your current font size and layout width settings in action.
              The Quran and Hadith pages will use the same width and text size you selected above.
            </p>
          </div>

          {/* About */}
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              About
            </h2>
            <div className="space-y-2">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-semibold">Hujjah Web</span> — Islamic research engine
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Quran, Hadith, and narrator chain explorer. Built with Next.js and better-sqlite3.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                For AI chat and offline audio, download the native desktop app.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
