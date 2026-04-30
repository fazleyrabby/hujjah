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
  onDarkModeToggle?: () => void;
  extra?: React.ReactNode;
  containerClass?: string;
  hiddenRoutes?: string[];
  icon?: React.ReactNode;
  hideExtra?: boolean;
  hideLang?: boolean;
}

interface NavLink {
  href: string;
  label: string;
  isIcon?: boolean;
}

const NAV_LINKS: NavLink[] = [
  { href: '/', label: 'Quran' },
  { href: '/hadith', label: 'Hadith' },
  { href: '/chain', label: 'Chain' },
  { href: '/about', label: 'About' },
  { href: '/chat', label: 'Chat' },
  // { href: '/settings', label: '', isIcon: true },
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
  icon,
  hideExtra = false,
  hideLang = false,
}: AppNavProps) {
  const pathname = usePathname();
  const i18nLang = lang === 'bn' ? 'bn' : 'en';

  const visibleLinks = NAV_LINKS.filter((link) => !hiddenRoutes.includes(link.href));

  return (
    <div className={`${containerClass} mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2 overflow-hidden`}>
      {/* Left section */}
      <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-white tracking-tight hover:text-teal-600 dark:hover:text-teal-400 transition-colors px-1.5 sm:px-2 py-1.5 rounded-lg flex-shrink-0"
        >
          {icon || (
            <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          )}
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
                className={`relative px-1.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                  active
                    ? 'text-teal-700 dark:text-teal-300'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-zinc-800'
                }`}
              >
                {(link as any).isIcon ? (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ) : (
                  link.label
                )}
                {active && !!(link as any).isIcon && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-teal-500 dark:bg-teal-400 rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Spacer to balance layout */}
        <div className="flex items-center gap-1">
          {extra}
        </div>
      </div>
    </div>
  );
}
