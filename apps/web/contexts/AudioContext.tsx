'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { DEFAULT_RECITER_ID } from '@/lib/reciters';

export interface PlayOptions {
  surah: number;
  ayah: number;
  autoPlay?: boolean;
}

interface AudioContextType {
  isPlaying: boolean;
  current: { surah: number; ayah: number } | null;
  progress: number;
  currentTime: number;
  duration: number;
  surahProgress: number;
  surahCurrentTime: number;
  surahTotalDuration: number;
  reciter: string;
  setReciter: (id: string) => void;
  play: (opts: PlayOptions) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  stop: () => void;
  seekTo: (ratio: number) => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

let globalAudio: HTMLAudioElement | null = null;
let preloadedAudio: HTMLAudioElement | null = null;
let preloadedKey: string | null = null;

function buildAudioUrl(surah: number, ayah: number, reciter: string): string {
  return `/api/audio?surah=${surah}&ayah=${ayah}&reciter=${reciter}`;
}

function cleanupPreload() {
  if (preloadedAudio) {
    preloadedAudio.src = '';
    preloadedAudio.load();
    preloadedAudio = null;
    preloadedKey = null;
  }
}

function schedulePreload(surah: number, ayah: number, reciter: string, verseCount: number) {
  const nextAyah = ayah + 1;
  if (nextAyah > verseCount) return;
  const key = `${surah}:${nextAyah}`;
  if (preloadedKey === key) return; // already preloading this one
  cleanupPreload();
  const audio = new Audio(buildAudioUrl(surah, nextAyah, reciter));
  audio.preload = 'auto';
  preloadedAudio = audio;
  preloadedKey = key;
}

async function fetchSurahVerseCount(surah: number): Promise<number> {
  try {
    const res = await fetch(`/api/quran?action=verseCount&surah=${surah}`);
    const data = await res.json();
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

function cleanupAudio() {
  if (globalAudio) {
    globalAudio.pause();
    globalAudio.src = '';
    globalAudio.load();
    globalAudio.onended = null;
    globalAudio.onerror = null;
    globalAudio.oncanplay = null;
    globalAudio.ontimeupdate = null;
    globalAudio = null;
  }
}

function vKey(surah: number, ayah: number): string {
  return `${surah}:${ayah}`;
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState<{ surah: number; ayah: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [surahProgress, setSurahProgress] = useState(0);
  const [surahCurrentTime, setSurahCurrentTime] = useState(0);
  const [surahTotalDuration, setSurahTotalDuration] = useState(0);
  const [reciter, setReciterState] = useState(DEFAULT_RECITER_ID);

  const reciterRef = useRef(DEFAULT_RECITER_ID);

  const setReciter = useCallback((id: string) => {
    reciterRef.current = id;
    setReciterState(id);
    localStorage.setItem('hujjah-reciter', id);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('hujjah-reciter');
    if (saved) { reciterRef.current = saved; setReciterState(saved); }
  }, []);

  const autoPlayRef = useRef(false);
  const loadingRef = useRef(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verseDurationsRef = useRef<Map<string, number>>(new Map());
  const surahVerseCountRef = useRef<number>(0);
  const currentSurahRef = useRef<number | null>(null);
  const currentRef = useRef(current);
  const surahTotalDurationRef = useRef(0);
  const playRef = useRef<(opts: PlayOptions) => Promise<void>>(async () => {});
  const surahVerseCountCacheRef = useRef<Map<number, number>>(new Map());

  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { surahTotalDurationRef.current = surahTotalDuration; }, [surahTotalDuration]);

  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const estimateDuration = useCallback((key: string) => {
    return verseDurationsRef.current.get(key) ?? 10;
  }, []);

  const computeSurahCumulative = useCallback((surah: number, ayah: number, verseTime: number) => {
    const count = surahVerseCountRef.current;
    if (count === 0) return { current: 0, total: 0 };

    let previous = 0;
    for (let a = 1; a < ayah; a++) {
      previous += verseDurationsRef.current.get(vKey(surah, a)) ?? 10;
    }

    let total = 0;
    for (let a = 1; a <= count; a++) {
      total += verseDurationsRef.current.get(vKey(surah, a)) ?? 10;
    }

    return { current: previous + verseTime, total };
  }, []);

  const startProgressTracking = useCallback(() => {
    clearProgressInterval();
    progressIntervalRef.current = setInterval(() => {
      if (globalAudio && currentRef.current) {
        const dur = globalAudio.duration || 0;
        const cur = globalAudio.currentTime || 0;
        setCurrentTime(cur);
        setDuration(dur);
        setProgress(dur > 0 ? cur / dur : 0);

        const { current: surahCur, total: surahTot } = computeSurahCumulative(
          currentRef.current.surah, currentRef.current.ayah, cur
        );
        setSurahCurrentTime(surahCur);
        setSurahTotalDuration(surahTot);
        setSurahProgress(surahTot > 0 ? surahCur / surahTot : 0);
      }
    }, 500);
  }, [clearProgressInterval, computeSurahCumulative]);

  const play = useCallback(async (opts: PlayOptions) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const isVerseTransition = currentRef.current?.surah === opts.surah && currentRef.current?.ayah !== opts.ayah;
    cleanupAudio();
    clearProgressInterval();

    const { surah, ayah, autoPlay = false } = opts;
    autoPlayRef.current = autoPlay;

    setProgress(0);
    setCurrentTime(0);
    setDuration(0);

    if (currentSurahRef.current !== surah) {
      currentSurahRef.current = surah;
      const cached = surahVerseCountCacheRef.current.get(surah);
      if (cached !== undefined) {
        surahVerseCountRef.current = cached;
      } else {
        surahVerseCountRef.current = await fetchSurahVerseCount(surah);
        surahVerseCountCacheRef.current.set(surah, surahVerseCountRef.current);
      }
      setSurahProgress(0);
      setSurahCurrentTime(0);
    }

    try {
      const key = vKey(surah, ayah);
      let audio: HTMLAudioElement;

      if (preloadedAudio && preloadedKey === key) {
        // Reuse already-buffered audio — no network wait
        audio = preloadedAudio;
        preloadedAudio = null;
        preloadedKey = null;
        globalAudio = audio;
        // If not yet ready, wait — but it's been buffering so this is near-instant
        if (audio.readyState < 3) {
          await new Promise<void>((resolve, reject) => {
            audio.oncanplay = () => resolve();
            audio.onerror = () => reject(new Error(`Failed to load audio for ${surah}:${ayah}`));
            setTimeout(() => reject(new Error('Audio load timeout')), 30000);
          });
        }
      } else {
        cleanupPreload();
        const url = buildAudioUrl(surah, ayah, reciterRef.current);
        audio = new Audio(url);
        audio.preload = 'auto';
        globalAudio = audio;
        await new Promise<void>((resolve, reject) => {
          audio.oncanplay = () => resolve();
          audio.onerror = () => reject(new Error(`Failed to load audio for ${surah}:${ayah}`));
          setTimeout(() => reject(new Error('Audio load timeout')), 30000);
        });
      }

      const dur = audio.duration || 0;
      if (dur > 0) {
        verseDurationsRef.current.set(vKey(surah, ayah), dur);
      }

      audio.onended = async () => {
        loadingRef.current = false;
        clearProgressInterval();
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(0);
        if (autoPlayRef.current) {
          const nextAyah = ayah + 1;
          if (nextAyah <= surahVerseCountRef.current) {
            await playRef.current({ surah, ayah: nextAyah, autoPlay: true });
          } else {
            cleanupAudio();
            setCurrent(null);
            currentSurahRef.current = null;
            autoPlayRef.current = false;
          }
        }
      };

      audio.onerror = () => {
        loadingRef.current = false;
        clearProgressInterval();
        setIsPlaying(false);
      };

      await audio.play();
      setIsPlaying(true);
      setCurrent({ surah, ayah });
      startProgressTracking();

      // Start preloading next verse immediately after this one begins
      schedulePreload(surah, ayah, reciterRef.current, surahVerseCountRef.current);
    } catch (err) {
      console.error('[Web Audio] Playback error:', err);
      setIsPlaying(false);
      setCurrent(null);
    } finally {
      loadingRef.current = false;
    }
  }, [clearProgressInterval, startProgressTracking]);

  useEffect(() => { playRef.current = play; }, [play]);

  const pause = useCallback(() => {
    if (globalAudio) {
      globalAudio.pause();
      setIsPlaying(false);
      clearProgressInterval();
    }
  }, [clearProgressInterval]);

  const resume = useCallback(async () => {
    if (globalAudio) {
      await globalAudio.play();
      setIsPlaying(true);
      startProgressTracking();
    } else if (currentSurahRef.current && currentRef.current) {
      await play({
        surah: currentSurahRef.current,
        ayah: currentRef.current.ayah,
        autoPlay: true,
      });
    } else if (currentSurahRef.current) {
      await play({
        surah: currentSurahRef.current,
        ayah: 1,
        autoPlay: true,
      });
    }
  }, [play, startProgressTracking]);

  const stop = useCallback(async (skipToNext: boolean = false) => {
    const currentAyah = currentRef.current?.ayah;
    const currentSurah = currentSurahRef.current;
    const wasAutoPlay = autoPlayRef.current;
    clearProgressInterval();
    cleanupAudio();
    cleanupPreload();
    setIsPlaying(false);
    setCurrent(null);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
    setSurahProgress(0);
    setSurahCurrentTime(0);
    setSurahTotalDuration(0);
    currentSurahRef.current = null;
    autoPlayRef.current = false;

    if (skipToNext && currentSurah && currentAyah) {
      const nextAyah = currentAyah + 1;
      if (nextAyah <= surahVerseCountRef.current) {
        await play({ surah: currentSurah, ayah: nextAyah, autoPlay: true });
      }
    } else if (wasAutoPlay && currentSurah && currentAyah) {
      const nextAyah = currentAyah + 1;
      if (nextAyah <= surahVerseCountRef.current) {
        await play({ surah: currentSurah, ayah: nextAyah, autoPlay: true });
      }
    }
  }, [clearProgressInterval, play]);

  const seekTo = useCallback((ratio: number) => {
    const surah = currentRef.current?.surah ?? currentSurahRef.current;
    if (!surah || surahVerseCountRef.current === 0) return;

    const targetTime = ratio * surahTotalDurationRef.current;

    let accumulated = 0;
    let targetAyah = 1;
    let ayahOffset = 0;
    for (let a = 1; a <= surahVerseCountRef.current; a++) {
      const dur = estimateDuration(vKey(surah, a));
      if (accumulated + dur >= targetTime) {
        targetAyah = a;
        ayahOffset = targetTime - accumulated;
        break;
      }
      accumulated += dur;
    }

    if (currentRef.current?.ayah === targetAyah && globalAudio) {
      globalAudio.currentTime = Math.max(0, Math.min(globalAudio.duration || 0, ayahOffset));
      setProgress(globalAudio.duration > 0 ? ayahOffset / globalAudio.duration : 0);
      setCurrentTime(globalAudio.currentTime);
      return;
    }

    cleanupAudio();
    clearProgressInterval();
    const url = buildAudioUrl(surah, targetAyah, reciterRef.current);
    const audio = new Audio(url);
    audio.preload = 'auto';
    globalAudio = audio;

    audio.oncanplay = async () => {
      audio.oncanplay = null;
      const dur = audio.duration || 0;
      if (dur > 0) verseDurationsRef.current.set(vKey(surah, targetAyah), dur);
      audio.currentTime = Math.max(0, Math.min(dur, ayahOffset));
      audio.onended = async () => {
        clearProgressInterval();
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(0);
        if (autoPlayRef.current) {
          const nextAyah = targetAyah + 1;
          if (nextAyah <= surahVerseCountRef.current) {
            await playRef.current({ surah, ayah: nextAyah, autoPlay: true });
          } else {
            cleanupAudio();
            setCurrent(null);
            currentSurahRef.current = null;
            autoPlayRef.current = false;
          }
        }
      };
      audio.onerror = () => { clearProgressInterval(); setIsPlaying(false); };
      await audio.play();
      setIsPlaying(true);
      setCurrent({ surah, ayah: targetAyah });
      startProgressTracking();
    };
    audio.onerror = () => {
      clearProgressInterval();
      setIsPlaying(false);
    };
  }, [clearProgressInterval, computeSurahCumulative, estimateDuration, startProgressTracking]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && current) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        e.preventDefault();
        if (isPlaying) pause();
        else resume();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, isPlaying, pause, resume]);

  useEffect(() => {
    return () => clearProgressInterval();
  }, [clearProgressInterval]);

  return (
    <AudioContext.Provider value={{
      isPlaying, current, progress, currentTime, duration,
      surahProgress, surahCurrentTime, surahTotalDuration,
      reciter, setReciter,
      play, pause, resume, stop, seekTo
    }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useQuranAudio(): AudioContextType {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useQuranAudio must be used inside AudioProvider');
  return ctx;
}