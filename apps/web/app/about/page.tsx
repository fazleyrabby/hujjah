'use client';

import { useState, useEffect } from 'react';
import { AppNav, useTheme } from '@hujjah/ui';

export default function AboutPage() {
  const [mounted, setMounted] = useState(false);
  const { darkMode, toggleDarkMode } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <header className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 sticky top-0 z-50">
        <AppNav
          darkMode={darkMode}
          onDarkModeToggle={toggleDarkMode}
          hiddenRoutes={['/chat']}
        />
      </header>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Branding + Created By — compact header row */}
        <div className="flex items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-900 dark:bg-zinc-800 rounded-xl flex items-center justify-center shadow flex-shrink-0">
              <span className="text-lg font-bold text-white tracking-tight">H</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">Hujjah</h1>
                <span className="text-[10px] font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 rounded-full">v1.0.0-beta</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Quran · Hadith · Sanad chain explorer</p>
            </div>
          </div>
          <a
            href="https://fazleyrabbi.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-right group"
          >
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Built by</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">Md. Fazley Rabbi</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">Software Engineer</p>
          </a>
        </div>

        {/* Data Sources */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">Data Sources & References</h2>

          <div className="space-y-4">
            {/* Quran */}
            <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
              <div className="w-10 h-10 bg-teal-100 dark:bg-teal-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-teal-700 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Quran Text</h3>
                  <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">VERIFIED</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Uthmani script from <a href="https://tanzil.net" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 dark:hover:text-gray-200">Tanzil.net</a> — 6,236 verses</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">License: verbatim redistribution permitted with credit to Tanzil — <a href="https://tanzil.net/download/" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-gray-300">terms of use</a></p>
              </div>
            </div>

            {/* Translations */}
            <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-700 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Translations</h3>
                  <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">VERIFIED</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">English (9 translators) & Bengali (2 translators) from <a href="https://tanzil.net" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 dark:hover:text-gray-200">Tanzil.net</a> — 68,596 rows</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">License: verbatim redistribution permitted with credit to Tanzil — <a href="https://tanzil.net/download/" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-gray-300">terms of use</a></p>
              </div>
            </div>

            {/* Hadith */}
            <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
              <div className="w-10 h-10 bg-gray-100 dark:bg-zinc-700 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Hadith Corpus</h3>
                  <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">VERIFIED</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Kutub al-Sittah (6 books) — 36,327 hadiths with sanad chains</p>
                <div className="flex items-center flex-wrap gap-x-2 mt-1">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500"><a href="https://data.mendeley.com/datasets/5xth87zwb5/5" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-gray-300">Sanadset 650K</a>: <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">CC BY 4.0</a></p>
                  <span className="text-[10px] text-gray-300 dark:text-gray-600">·</span>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500"><a href="https://github.com/fawazahmed0/hadith-api" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-gray-300">fawazahmed0/hadith-api</a>: The Unlicense (public domain)</p>
                </div>
              </div>
            </div>

            {/* Hadith Translations */}
            <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-700 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Hadith Translations</h3>
                  <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">VERIFIED</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">English: 36,324 | Bengali: 30,750</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Sources: Classic (GitHub API) + AI (Qwen3.5-9B)</p>
              </div>
            </div>

            {/* Audio */}
            <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
              <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-rose-700 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Quran Audio</h3>
                  <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">VERIFIED</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">6 reciters — streamed via a multi-CDN proxy with fallback</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Primary: verses.quran.com (BunnyCDN) · Fallback: cdn.islamic.network · Last resort: everyayah.com</p>
              </div>
            </div>

            {/* AI / Embeddings */}
            <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-indigo-700 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">AI & Embeddings</h3>
                  <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">VERIFIED</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Embeddings: BAAI/bge-m3 (ONNX) from HuggingFace — <a href="https://huggingface.co/BAAI/bge-m3" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 dark:hover:text-gray-200">MIT License</a></p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">LLM: Qwen2.5-0.5B & Qwen2.5-1.5B (GGUF) via llama.cpp — <a href="https://huggingface.co/Qwen/Qwen2.5-0.5B" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 dark:hover:text-gray-200">Apache 2.0</a></p>
              </div>
            </div>

            {/* Narrator Chains */}
            <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-emerald-700 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Narrator Chains (Sanad)</h3>
                  <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">VERIFIED</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1"><a href="https://data.mendeley.com/datasets/5xth87zwb5/5" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 dark:hover:text-gray-200">Sanadset 650K</a> hadith corpus — 24,184 narrators · 94,188 transmission edges</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Narrator names stored as-is from sanad text; honorifics (RA) omitted · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">CC BY 4.0</a> · <a href="https://www.sciencedirect.com/science/article/pii/S2352340922007478" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-gray-300">paper</a></p>
              </div>
            </div>

            {/* Narrator Biographical Data */}
            <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
              <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-violet-700 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Narrator Biographical Data</h3>
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">PARTIAL</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Death year, city, reliability (thiqah/da'if) enriched from multiple sources</p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-teal-400 flex-shrink-0" />
                    <span><span className="font-medium text-gray-600 dark:text-gray-300">528 narrators</span> — manually verified (death year, city, reliability)</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                    <span><span className="font-medium text-gray-600 dark:text-gray-300">837 narrators</span> — <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-gray-300">Wikidata</a> (<a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">CC0</a>)</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                    <span><span className="font-medium text-gray-600 dark:text-gray-300">50 narrators</span> — Wikidata (<a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">CC0</a>) + Wikipedia (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">CC BY-SA 3.0</a>) cross-referenced</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0" />
                    <span><span className="font-medium text-gray-600 dark:text-gray-300">22,769 narrators</span> — name only (extracted from sanad text, no biographical data yet)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a
            href="https://github.com/fazleyrabby/hujjah"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-gray-900 dark:text-white hover:border-gray-300 dark:hover:border-zinc-500 hover:shadow-sm transition-all"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            GitHub
          </a>
          <a
            href="https://github.com/fazleyrabby/hujjah/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-gray-900 dark:text-white hover:border-gray-300 dark:hover:border-zinc-500 hover:shadow-sm transition-all"
          >
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            Report Issue
          </a>
          <a
            href="https://github.com/sponsors/fazleyrabby"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 dark:bg-zinc-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-zinc-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
            Support
          </a>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-12">
          Built with care in Chittagong, Bangladesh. Licensed under Apache-2.0.
        </p>
      </div>
    </div>
  );
}
