'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuranAudio } from '@/contexts/AudioContext';

interface SurahInfo {
  id: number;
  name_ar: string;
  name_en: string;
  name_bn: string;
}

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioPlayer() {
  const {
    isPlaying, current, surahProgress, surahCurrentTime, surahTotalDuration,
    pause, resume, stop, seekTo
  } = useQuranAudio();

  const [surahInfo, setSurahInfo] = useState<SurahInfo | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPreview, setDragPreview] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (current?.surah) {
      fetch(`/api/quran?action=surah&id=${current.surah}`)
        .then(r => r.json())
        .then(setSurahInfo)
        .catch(() => setSurahInfo(null));
    } else {
      setSurahInfo(null);
    }
  }, [current?.surah]);

  const computeRatio = useCallback((clientX: number) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragPreview(computeRatio(e.clientX));
  }, [computeRatio]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setDragPreview(computeRatio(e.clientX));
  }, [isDragging, computeRatio]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const ratio = computeRatio(e.clientX);
    seekTo(ratio);
    setIsDragging(false);
    setDragPreview(null);
  }, [isDragging, computeRatio, seekTo]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!current) return null;

  const displayProgress = dragPreview !== null ? dragPreview : surahProgress;

  function navigateToVerse(surah: number, ayah: number) {
    window.dispatchEvent(new CustomEvent('hujjah:navigate-verse', { detail: { surah, ayah } }));
  }

  if (minimized) {
    return (
      <div className="fixed bottom-4 left-4 z-[65] flex items-center gap-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-full shadow-lg px-3 py-2 pr-4">
        <div className="w-8 h-8 bg-teal-50 dark:bg-teal-900/20 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-teal-700 dark:text-teal-400">{current.surah}</span>
        </div>
        <button
          className="min-w-0 text-left hover:opacity-75 transition-opacity"
          onClick={() => navigateToVerse(current.surah, current.ayah)}
          title="Go to verse"
        >
          <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
            {surahInfo ? surahInfo.name_en : `Surah ${current.surah}`}
          </p>
          <p className="text-[10px] text-teal-600 dark:text-teal-400">
            Ayah {current.ayah} ↗
          </p>
        </button>
        {isPlaying ? (
          <button onClick={pause} className="w-7 h-7 flex items-center justify-center bg-teal-600 text-white rounded-full">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
          </button>
        ) : (
          <button onClick={resume} className="w-7 h-7 flex items-center justify-center bg-teal-600 text-white rounded-full">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </button>
        )}
        <button
          onClick={() => setMinimized(false)}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          title="Expand player"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-700 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] animate-slide-up">
      <div
        ref={barRef}
        className="h-1.5 bg-gray-100 dark:bg-zinc-800 w-full cursor-pointer group relative"
        onMouseDown={handleMouseDown}
      >
        <div
          className="h-full bg-teal-500 relative"
          style={{ width: `${displayProgress * 100}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white dark:bg-zinc-200 border-2 border-teal-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm" />
        </div>
        {isDragging && dragPreview !== null && (
          <div
            className="absolute -top-7 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none"
            style={{ left: `${dragPreview * 100}%`, transform: 'translateX(-50%)' }}
          >
            {fmtTime(dragPreview * surahTotalDuration)}
          </div>
        )}
      </div>

      <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-center gap-3">
        <div className="w-9 h-9 bg-teal-50 dark:bg-teal-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-teal-700 dark:text-teal-400">{current.surah}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => seekTo(0)}
            className="w-8 h-8 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            title="Restart ayah"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
          </button>

          {isPlaying ? (
            <button
              onClick={pause}
              className="w-12 h-12 flex items-center justify-center bg-teal-600 hover:bg-teal-500 text-white rounded-full transition-colors shadow-sm"
              title="Pause"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
            </button>
          ) : (
            <button
              onClick={resume}
              className="w-12 h-12 flex items-center justify-center bg-teal-600 hover:bg-teal-500 text-white rounded-full transition-colors shadow-sm"
              title="Resume"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </button>
          )}

          <button
            onClick={stop}
            className="w-8 h-8 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
            title="Stop"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
          </button>
        </div>

        <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
          <button
            onClick={() => navigateToVerse(current.surah, current.ayah)}
            className="text-xs text-gray-500 dark:text-gray-400 truncate hover:text-teal-600 dark:hover:text-teal-400 transition-colors text-right"
            title="Go to verse"
          >
            {surahInfo ? surahInfo.name_en : `Surah ${current.surah}`} · {fmtTime(surahCurrentTime)} / {fmtTime(surahTotalDuration)} ↗
          </button>
          <button
            onClick={() => setMinimized(true)}
            className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            title="Minimize player"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}