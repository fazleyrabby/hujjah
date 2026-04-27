'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

export interface LangOption {
  code: string;
  label: string;
}

interface AppNavProps {
  lang?: string;
  onLangChange?: (lang: string) => void;
  langs?: LangOption[];
  darkMode: boolean;
  onDarkModeToggle: () => void;
  extra?: React.ReactNode;
  containerClass?: string;
  hiddenRoutes?: string[];
}

const NAV_LINKS = [
  { href: '/', label: 'Quran' },
  { href: '/hadith', label: 'Hadith' },
  { href: '/chain', label: 'Chain' },
  { href: '/chat', label: 'Chat' },
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
  containerClass = 'max-w-5xl',
  hiddenRoutes = [],
}: AppNavProps) {
  const pathname = usePathname();
  const isHome = pathname === '/';

  const visibleLinks = NAV_LINKS.filter((link) => !hiddenRoutes.includes(link.href));

  return (
    <div className={`${containerClass} mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2`}>
      {/* Left section */}
      <div className="flex items-center gap-1 min-w-0 flex-1">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-white tracking-tight hover:text-teal-600 dark:hover:text-teal-400 transition-colors px-2 py-1.5 rounded-lg flex-shrink-0"
        >
          <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <span className="hidden sm:inline">Hujjah</span>
        </Link>

        {/* Divider */}
        <div className="hidden sm:block w-px h-5 bg-gray-200 dark:bg-zinc-700 mx-2 flex-shrink-0" />

        {/* Nav links - scrollable on mobile */}
        <nav className="flex items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-2 sm:px-3 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                  active
                    ? 'text-teal-700 dark:text-teal-300'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800'
                }`}
              >
                {link.label}
                {active && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-teal-500 dark:bg-teal-400 rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        {extra}

        {/* Lang toggle */}
        {langs.length > 0 && onLangChange && (
          <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
            {langs.map((l) => (
              <button
                key={l.code}
                onClick={() => onLangChange(l.code)}
                className={`px-2 sm:px-4 py-1 text-xs font-semibold rounded-md transition-all ${
                  lang === l.code
                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}

        {/* Settings */}
        <Link
          href="/settings"
          className="p-1.5 sm:p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          title="Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>

        {/* Dark mode */}
        <button
          onClick={onDarkModeToggle}
          className="p-1.5 sm:p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          title={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
