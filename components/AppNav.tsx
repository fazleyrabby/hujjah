'use client';

import { usePathname } from 'next/navigation';

export interface LangOption {
  code: string;
  label: string;
}

interface AppNavProps {
  lang: string;
  onLangChange: (lang: string) => void;
  langs?: LangOption[];
  darkMode: boolean;
  onDarkModeToggle: () => void;
  extra?: React.ReactNode;
}

const NAV_LINKS = [
  { href: '/', label: 'Quran' },
  { href: '/hadith', label: 'Hadith' },
  { href: '/chain', label: 'Chain' },
];

const DEFAULT_LANGS: LangOption[] = [
  { code: 'en', label: 'EN' },
  { code: 'bn', label: 'বাং' },
];

export default function AppNav({
  lang,
  onLangChange,
  langs = DEFAULT_LANGS,
  darkMode,
  onDarkModeToggle,
  extra,
}: AppNavProps) {
  const pathname = usePathname();

  return (
    <div className="max-w-3xl mx-auto px-4 h-11 flex items-center justify-between gap-3">
      {/* Left: logo + nav links */}
      <div className="flex items-center gap-0.5">
        <a
          href="/"
          className="text-sm font-bold text-gray-900 dark:text-white tracking-tight hover:text-teal-600 dark:hover:text-teal-400 transition-colors px-2 py-1"
        >
          Hujjah
        </a>
        <span className="text-gray-300 dark:text-gray-700 text-xs select-none mx-0.5">·</span>
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <a
              key={link.href}
              href={link.href}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                active
                  ? 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800'
              }`}
            >
              {link.label}
            </a>
          );
        })}
      </div>

      {/* Right: extra + lang + dark mode */}
      <div className="flex items-center gap-1.5">
        {extra}

        {/* Lang toggle */}
        <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-md p-0.5">
          {langs.map((l) => (
            <button
              key={l.code}
              onClick={() => onLangChange(l.code)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-all ${
                lang === l.code
                  ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Dark mode */}
        <button
          onClick={onDarkModeToggle}
          className="w-7 h-7 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          title={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
