'use client';

import { useState, useEffect } from 'react';
import { useQuranAudio } from '@/contexts/AudioContext';
import { getSurahById, type Surah } from '@/lib/db';

export default function AudioPlayer() {
  const { isPlaying, current, pause, resume, stop } = useQuranAudio();
  const [surahInfo, setSurahInfo] = useState<Surah | null>(null);

  useEffect(() => {
    if (current?.surah) {
      getSurahById(current.surah).then(setSurahInfo).catch(() => setSurahInfo(null));
    } else {
      setSurahInfo(null);
    }
  }, [current?.surah]);

  if (!current) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border-t border-gray-200 dark:border-zinc-700 shadow-lg animate-slide-up">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4">
        {/* Surah Info — clickable to navigate back */}
        <a
          href={`/?surah=${current.surah}`}
          className="flex-1 min-w-0 group"
          title="Go to surah"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
              {surahInfo ? surahInfo.name_en : `Surah ${current.surah}`}
            </span>
            <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 group-hover:text-teal-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {surahInfo && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate hidden sm:inline" dir="rtl">
                {surahInfo.name_ar}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Ayah {current.ayah}
          </p>
        </a>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Play / Pause */}
          {isPlaying ? (
            <button
              onClick={pause}
              className="w-10 h-10 flex items-center justify-center bg-teal-600 hover:bg-teal-500 text-white rounded-full transition-colors"
              title="Pause"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            </button>
          ) : (
            <button
              onClick={resume}
              className="w-10 h-10 flex items-center justify-center bg-teal-600 hover:bg-teal-500 text-white rounded-full transition-colors"
              title="Resume"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          )}

          {/* Stop */}
          <button
            onClick={stop}
            className="w-9 h-9 flex items-center justify-center bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-600 dark:text-gray-400 rounded-full transition-colors"
            title="Stop"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h12v12H6z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
