'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { getDB, getSurahVerseCount } from '@/lib/db';
import { RECITERS, DEFAULT_RECITER_ID, findReciter, type Reciter } from '@/lib/reciters';

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

function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

function buildEveryayahUrl(surah: number, ayah: number, folder: string): string {
  return `https://everyayah.com/data/${folder}/${pad3(surah)}${pad3(ayah)}.mp3`;
}

function buildVersesQuranUrl(surah: number, ayah: number, path: string): string {
  return `https://verses.quran.com/${path}/${pad3(surah)}${pad3(ayah)}.mp3`;
}

function buildIslamicNetworkUrl(surah: number, ayah: number, id: string): string {
  return `https://cdn.islamic.network/quran/audio/128/${id}/${surah.toString().padStart(3, '0')}${ayah.toString().padStart(3, '0')}.mp3`;
}

async function resolveAudioUrl(surah: number, ayah: number, reciter: Reciter): Promise<string> {
  const folders = reciter.everyayahFolder ? [`everyayah:${reciter.everyayahFolder}`] : [];
  const cdns = [
    ...folders.map(f => {
      const [, folder] = f.split(':');
      return buildEveryayahUrl(surah, ayah, folder!);
    }),
    reciter.versesQuranPath ? buildVersesQuranUrl(surah, ayah, reciter.versesQuranPath) : null,
    reciter.islamicNetworkId ? buildIslamicNetworkUrl(surah, ayah, reciter.islamicNetworkId) : null,
  ].filter(Boolean) as string[];

  for (const url of cdns) {
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      if (resp.ok) return url;
    } catch { /* try next */ }
  }
  return cdns[0];
}

async function resolveLocalPath(surah: number, ayah: number): Promise<string | null> {
  try {
    const { exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const filename = `audio/${surah}_${ayah}.mp3`;
    const found = await exists(filename, { baseDir: BaseDirectory.AppData });
    if (!found) return null;
    const { appDataDir } = await import('@tauri-apps/api/path');
    const dir = await appDataDir();
    return `${dir}/audio/${surah}_${ayah}.mp3`;
  } catch {
    return null;
  }
}

async function downloadAndCache(surah: number, ayah: number, url: string): Promise<string> {
  try {
    const audioResp = await fetch(url);
    if (!audioResp.ok) throw new Error(`HTTP ${audioResp.status}`);
    const blob = await audioResp.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    const { mkdir, writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    try {
      await mkdir('audio', { recursive: true, baseDir: BaseDirectory.AppData });
    } catch { /* exists */ }
    await writeFile(`audio/${surah}_${ayah}.mp3`, uint8, { baseDir: BaseDirectory.AppData });
    const { appDataDir } = await import('@tauri-apps/api/path');
    const dir = await appDataDir();
    return `${dir}/audio/${surah}_${ayah}.mp3`;
  } catch (err) {
    console.warn('[Audio] Cache failed, using streamed URL:', err);
    return url;
  }
}

async function resolveAudioPath(surah: number, ayah: number, reciter: Reciter): Promise<string> {
  const local = await resolveLocalPath(surah, ayah);
  if (local) return local;
  const url = await resolveAudioUrl(surah, ayah, reciter);
  return downloadAndCache(surah, ayah, url);
}

async function getNextAyah(surah: number, ayah: number): Promise<PlayOptions | null> {
  const db = await getDB();
  const sql = `SELECT surah, ayah FROM verses WHERE surah = ? AND ayah = ? + 1 LIMIT 1`;
  const rows = await db.select<{ surah: number; ayah: number }[]>(sql, [surah, ayah]);
  if (rows.length === 0) return null;
  return { surah: rows[0].surah, ayah: rows[0].ayah };
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

  const autoPlayRef = useRef(false);
  const loadingRef = useRef(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verseDurationsRef = useRef<Map<string, number>>(new Map());
  const surahVerseCountRef = useRef<number>(0);
  const currentSurahRef = useRef<number | null>(null);
  const currentRef = useRef(current);
  const surahTotalDurationRef = useRef(0);
  const reciterRef = useRef(DEFAULT_RECITER_ID);

  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { surahTotalDurationRef.current = surahTotalDuration; }, [surahTotalDuration]);

  const playRef = useRef<(opts: PlayOptions) => Promise<void>>(async () => {});

  const setReciter = useCallback((id: string) => {
    reciterRef.current = id;
    setReciterState(id);
    localStorage.setItem('hujjah-reciter', id);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('hujjah-reciter');
    if (saved && RECITERS.find(r => r.id === saved)) {
      reciterRef.current = saved;
      setReciterState(saved);
    }
  }, []);

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

        const { current: surahCur, total: surahTot } = computeSurahCumulative(currentRef.current.surah, currentRef.current.ayah, cur);
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
      surahVerseCountRef.current = await getSurahVerseCount(surah);
      setSurahProgress(0);
      setSurahCurrentTime(0);
    }

    try {
      const rec = findReciter(reciterRef.current);
      const path = await resolveAudioPath(surah, ayah, rec);
      const audio = new Audio(path);
      audio.preload = 'auto';
      globalAudio = audio;

      await new Promise<void>((resolve, reject) => {
        audio.oncanplay = () => resolve();
        audio.onerror = () => reject(new Error(`Failed to load audio for ${surah}:${ayah}`));
        setTimeout(() => reject(new Error('Audio load timeout')), 10000);
      });

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
          const next = await getNextAyah(surah, ayah);
          if (next) {
            await playRef.current({ ...next, autoPlay: true });
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
    } catch (err) {
      console.error('[Audio] Playback error:', err);
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
    }
  }, [startProgressTracking]);

  const stop = useCallback(() => {
    clearProgressInterval();
    cleanupAudio();
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
  }, [clearProgressInterval]);

  const seekTo = useCallback(async (ratio: number) => {
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
      const { current: surahCur, total: surahTot } = computeSurahCumulative(surah, targetAyah, globalAudio.currentTime);
      setSurahCurrentTime(surahCur);
      setSurahProgress(surahTot > 0 ? surahCur / surahTot : 0);
      return;
    }

    try {
      cleanupAudio();
      clearProgressInterval();
      const rec = findReciter(reciterRef.current);
      const path = await resolveAudioPath(surah, targetAyah, rec);
      const audio = new Audio(path);
      audio.preload = 'auto';
      globalAudio = audio;

      await new Promise<void>((resolve, reject) => {
        audio.oncanplay = () => resolve();
        audio.onerror = () => reject(new Error(`Failed to load audio for ${surah}:${targetAyah}`));
        setTimeout(() => reject(new Error('Audio load timeout')), 10000);
      });

      const dur = audio.duration || 0;
      if (dur > 0) {
        verseDurationsRef.current.set(vKey(surah, targetAyah), dur);
      }

      audio.currentTime = Math.max(0, Math.min(dur, ayahOffset));

      audio.onended = async () => {
        clearProgressInterval();
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(0);
        if (autoPlayRef.current) {
          const next = await getNextAyah(surah, targetAyah);
          if (next) {
            await playRef.current({ ...next, autoPlay: true });
          } else {
            cleanupAudio();
            setCurrent(null);
            currentSurahRef.current = null;
            autoPlayRef.current = false;
          }
        }
      };

      audio.onerror = () => {
        clearProgressInterval();
        setIsPlaying(false);
      };

      await audio.play();
      setIsPlaying(true);
      setCurrent({ surah, ayah: targetAyah });
      startProgressTracking();
    } catch (err) {
      console.error('[Audio] Seek error:', err);
    }
  }, [clearProgressInterval, computeSurahCumulative, estimateDuration, startProgressTracking]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && current) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
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