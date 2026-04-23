'use client';

import { useState, useEffect } from 'react';
import { useQuranAudio } from '@/contexts/AudioContext';
import { getSurahById, type Surah } from '@/lib/db';

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioPlayer() {
  const { isPlaying, current, progress, currentTime, duration, pause, resume, stop, seekTo } = useQuranAudio();
  const [surahInfo, setSurahInfo] = useState<Surah | null>(null);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);

  useEffect(() => {
    if (current?.surah) {
      getSurahById(current.surah).then(setSurahInfo).catch(() => setSurahInfo(null));
    } else {
      setSurahInfo(null);
    }
  }, [current?.surah]);

  if (!current) return null;

  const displayProgress = hoverProgress !== null ? hoverProgress : progress;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-700 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      {/* Progress bar — clickable to seek */}
      <div
        className="h-1 bg-gray-100 dark:bg-zinc-800 w-full cursor-pointer group"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          seekTo(Math.max(0, Math.min(1, ratio)));
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHoverProgress(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
        }}
        onMouseLeave={() => setHoverProgress(null)}
      >
        <div
          className="h-full bg-teal-500 transition-all duration-100 relative"
          style={{ width: `${displayProgress * 100}%` }}
        >
          {/* Drag handle */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-teal-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-4">
        {/* Album art / Surah number */}
        <div className="w-9 h-9 bg-teal-50 dark:bg-teal-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-teal-700 dark:text-teal-400">{current.surah}</span>
        </div>

        {/* Surah Info + Time */}
        <a href={`/?surah=${current.surah}`} className="flex-1 min-w-0 group">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
            {surahInfo ? surahInfo.name_en : `Surah ${current.surah}`}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Ayah {current.ayah} · {fmtTime(currentTime)} / {fmtTime(duration)}
          </p>
        </a>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Restart ayah */}
          <button
            onClick={() => seekTo(0)}
            className="w-8 h-8 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            title="Restart ayah"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          {/* Play / Pause */}
          {isPlaying ? (
            <button
              onClick={pause}
              className="w-10 h-10 flex items-center justify-center bg-teal-600 hover:bg-teal-500 text-white rounded-full transition-colors shadow-sm"
              title="Pause"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            </button>
          ) : (
            <button
              onClick={resume}
              className="w-10 h-10 flex items-center justify-center bg-teal-600 hover:bg-teal-500 text-white rounded-full transition-colors shadow-sm"
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
            className="w-8 h-8 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
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
