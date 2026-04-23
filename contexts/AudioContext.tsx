'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { getDB } from '@/lib/db';

export interface PlayOptions {
  surah: number;
  ayah: number;
  autoPlay?: boolean;
}

interface AudioContextType {
  isPlaying: boolean;
  current: { surah: number; ayah: number } | null;
  play: (opts: PlayOptions) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  stop: () => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

let globalAudio: HTMLAudioElement | null = null;

function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

function buildAudioUrl(surah: number, ayah: number): string {
  return `https://everyayah.com/data/Alafasy_128kbps/${pad3(surah)}${pad3(ayah)}.mp3`;
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

async function downloadAndCache(surah: number, ayah: number): Promise<string> {
  const audioUrl = buildAudioUrl(surah, ayah);
  try {
    const audioResp = await fetch(audioUrl);
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
    return audioUrl;
  }
}

async function resolveAudioPath(surah: number, ayah: number): Promise<string> {
  const local = await resolveLocalPath(surah, ayah);
  if (local) return local;
  return downloadAndCache(surah, ayah);
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
    globalAudio = null;
  }
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState<{ surah: number; ayah: number } | null>(null);
  const autoPlayRef = useRef(false);

  const play = useCallback(async (opts: PlayOptions) => {
    cleanupAudio();
    const { surah, ayah, autoPlay = false } = opts;
    autoPlayRef.current = autoPlay;

    try {
      const path = await resolveAudioPath(surah, ayah);
      const audio = new Audio(path);
      audio.preload = 'auto';
      globalAudio = audio;

      await new Promise<void>((resolve, reject) => {
        audio.oncanplay = () => resolve();
        audio.onerror = () => reject(new Error(`Failed to load audio for ${surah}:${ayah}`));
        setTimeout(() => reject(new Error('Audio load timeout')), 10000);
      });

      audio.onended = async () => {
        setIsPlaying(false);
        if (autoPlayRef.current) {
          const next = await getNextAyah(surah, ayah);
          if (next) {
            await play({ ...next, autoPlay: true });
          } else {
            // Surah finished — stop and clear
            cleanupAudio();
            setCurrent(null);
            autoPlayRef.current = false;
          }
        }
      };

      audio.onerror = () => {
        setIsPlaying(false);
      };

      await audio.play();
      setIsPlaying(true);
      setCurrent({ surah, ayah });
    } catch (err) {
      console.error('[Audio] Playback error:', err);
      setIsPlaying(false);
      setCurrent(null);
    }
  }, []);

  const pause = useCallback(() => {
    if (globalAudio) {
      globalAudio.pause();
      setIsPlaying(false);
    }
  }, []);

  const resume = useCallback(async () => {
    if (globalAudio) {
      await globalAudio.play();
      setIsPlaying(true);
    }
  }, []);

  const stop = useCallback(() => {
    cleanupAudio();
    setIsPlaying(false);
    setCurrent(null);
    autoPlayRef.current = false;
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && current) {
        e.preventDefault();
        if (isPlaying) pause();
        else resume();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, isPlaying, pause, resume]);

  return (
    <AudioContext.Provider value={{ isPlaying, current, play, pause, resume, stop }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useQuranAudio(): AudioContextType {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useQuranAudio must be used inside AudioProvider');
  return ctx;
}
