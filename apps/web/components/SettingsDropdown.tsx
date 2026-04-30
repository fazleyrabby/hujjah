'use client';

interface SettingsDropdownProps {
  isOpen: boolean;
  onToggle: () => void;
  lang: string;
  onLangChange: (lang: string) => void;
  fontSize: string;
  onFontSizeChange: (size: string) => void;
  arabicFont: string;
  onArabicFontChange: (font: string) => void;
  darkMode: boolean;
  onDarkModeToggle: () => void;
  onMoreSettingsClick?: () => void;
  setIsOpen: (open: boolean) => void;
  langOptions?: { code: string; label: string }[];
}

export default function SettingsDropdown({
  isOpen,
  onToggle,
  lang,
  onLangChange,
  fontSize,
  onFontSizeChange,
  arabicFont,
  onArabicFontChange,
  darkMode,
  onDarkModeToggle,
  onMoreSettingsClick,
  setIsOpen,
  langOptions = [
    { code: 'en', label: 'English' },
    { code: 'bn', label: 'বাংলা' },
  ],
}: SettingsDropdownProps) {
  const i18nLang = lang === 'bn' ? 'bn' : 'en';

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-gray-400"
        title={i18nLang === 'bn' ? 'সেটিংস' : 'Settings'}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
      {isOpen && (
        <>
          <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-lg z-[60] overflow-hidden">
            <div className="py-2">
              <div className="px-3 py-2 border-b border-gray-100 dark:border-zinc-800">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {i18nLang === 'bn' ? 'সেটিংস' : 'Settings'}
                </span>
              </div>
              <div className="px-3 py-2">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {i18nLang === 'bn' ? 'ভাষা' : 'Language'}
                </label>
                <select
                  value={lang}
                  onChange={e => onLangChange(e.target.value)}
                  className="w-full text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-1.5"
                >
                  {langOptions.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div className="px-3 py-2">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {i18nLang === 'bn' ? 'ফন্ট সাইজ' : 'Font Size'}
                </label>
                <select
                  value={fontSize}
                  onChange={e => onFontSizeChange(e.target.value)}
                  className="w-full text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-1.5"
                >
                  <option value="small">{i18nLang === 'bn' ? 'ছোট' : 'Small'}</option>
                  <option value="medium">{i18nLang === 'bn' ? 'মাঝারি' : 'Medium'}</option>
                  <option value="large">{i18nLang === 'bn' ? 'বড়' : 'Large'}</option>
                </select>
              </div>
              <div className="px-3 py-2">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {i18nLang === 'bn' ? 'আরবি ফন্ট' : 'Arabic Font'}
                </label>
                <select
                  value={arabicFont}
                  onChange={e => onArabicFontChange(e.target.value)}
                  className="w-full text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-1.5"
                >
                  <option value="uthmani">Scheherazade New</option>
                  <option value="indopak">KFGQPC Uthmani Script HAFS</option>
                </select>
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {i18nLang === 'bn' ? 'ডার্ক মোড' : 'Dark Mode'}
                </span>
                <button
                  onClick={onDarkModeToggle}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    darkMode ? 'bg-teal-600' : 'bg-gray-300 dark:bg-zinc-600'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                      darkMode ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  onMoreSettingsClick?.();
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-teal-600 dark:text-teal-400 hover:bg-gray-50 dark:hover:bg-zinc-800"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {i18nLang === 'bn' ? 'আরও সেটিংস' : 'More Settings'}
              </button>
            </div>
          </div>
          <div className="fixed inset-0" onClick={() => setIsOpen(false)} />
        </>
      )}
    </div>
  );
}
