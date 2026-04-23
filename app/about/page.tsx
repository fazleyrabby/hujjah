'use client';

import { useState, useEffect } from 'react';

export default function AboutPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-base dark:bg-[#0a0a0a]">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* ─── Back Navigation ─── */}
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-8 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Hujjah
        </a>

        {/* ─── Branding Section ─── */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 mx-auto mb-6 bg-gray-900 dark:bg-zinc-800 rounded-2xl flex items-center justify-center shadow-lg">
            <span className="text-3xl font-bold text-white tracking-tight">H</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">Hujjah</h1>
          <p className="text-sm font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 inline-block px-3 py-1 rounded-full mb-4">
            v1.0.0-beta
          </p>
          <p className="text-gray-600 dark:text-gray-400 text-sm max-w-md mx-auto leading-relaxed">
            A privacy-first, offline-capable Islamic research engine. Search the Quran in English and Bengali — entirely on your device.
          </p>
        </div>

        {/* ─── Created By ─── */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 mb-8 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Created By</p>
          <a
            href="https://fazleyrabbi.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-gray-900 dark:text-white font-semibold hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Md. Fazley Rabbi
          </a>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Software Engineer</p>
        </div>

        {/* ─── Data Provenance ─── */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">Data Sources</h2>

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
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Uthmani script from Tanzil.net — 6,236 verses</p>
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
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">English & Bengali from Tanzil.net — 68,596 rows</p>
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
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">COMING SOON</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sanadset 650K Data on Hadith Narrators</p>
              </div>
            </div>

            {/* AI */}
            <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-purple-700 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">AI Model</h3>
                  <span className="text-[10px] font-bold text-teal-700 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">LOCAL-ONLY</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">all-MiniLM-L6-v2 via Transformers.js — 100% offline</p>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Privacy Guard ─── */}
        <div className="bg-gray-900 dark:bg-zinc-800 text-white rounded-xl p-6 mb-8 text-center">
          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2">Privacy Guard</h3>
          <p className="text-sm text-gray-300 dark:text-gray-400 leading-relaxed">
            No data ever leaves your device. All search, AI embeddings, and translations run entirely offline using local SQLite and bundled models.
          </p>
        </div>

        {/* ─── Repository & Links ─── */}
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

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-12">
          Built with care in Chittagong, Bangladesh. Licensed under Apache-2.0.
        </p>
      </div>
    </div>
  );
}
