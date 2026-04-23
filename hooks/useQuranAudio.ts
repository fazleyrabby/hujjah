/**
 * hooks/useQuranAudio.ts
 *
 * Quran Audio Engine
 * - Plays single ayah
 * - Auto-plays next ayah
 * - Caches audio locally via Tauri FS
 * - Streams from everyayah.com CDN (reliable, direct MP3)
 */

import { useState, useRef, useCallback } from 'react';
import { getDB } from '@/lib/db';

export interface PlayOptions {
  surah: number;
  ayah: number;
  autoPlay?: boolean;
}

export interface AudioState {
  surah: number;
  ayah: number;
  isPlaying: boolean;
}

let globalAudio: HTMLAudioElement | null = null;

function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

/**
 * Build the direct CDN URL for a verse.
 * Uses everyayah.com which serves MP3s directly with permissive CORS.
 */
function buildAudioUrl(surah: number, ayah: number): string {
  return `https://everyayah.com/data/Alafasy_128kbps/${pad3(surah)}${pad3(ayah)}.mp3`;
}

/**
 * Resolve the local audio path for a verse.
 */
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

/**
 * Download audio from CDN and cache it locally.
 */
async function downloadAndCache(surah: number, ayah: number): Promise<string> {
  const audioUrl = buildAudioUrl(surah, ayah);

  // Try to download and cache
  try {
    const audioResp = await fetch(audioUrl);
    if (!audioResp.ok) {
      throw new Error(`HTTP ${audioResp.status}`);
    }
    const blob = await audioResp.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Save to Tauri app data directory
    const { mkdir, writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const filename = `audio/${surah}_${ayah}.mp3`;

    try {
      await mkdir('audio', { recursive: true, baseDir: BaseDirectory.AppData });
    } catch {
      // Directory may already exist
    }

    await writeFile(filename, uint8, {
      baseDir: BaseDirectory.AppData,
    });

    console.log(`[Audio] Cached ${surah}:${ayah}`);

    // Return local path for immediate playback
    const { appDataDir } = await import('@tauri-apps/api/path');
    const dir = await appDataDir();
    return `${dir}/audio/${surah}_${ayah}.mp3`;
  } catch (err) {
    console.warn('[Audio] Cache failed, using streamed URL:', err);
    return audioUrl;
  }
}

/**
 * Get the audio path: prefer local, fallback to download + cache.
 */
async function resolveAudioPath(surah: number, ayah: number): Promise<string> {
  const local = await resolveLocalPath(surah, ayah);
  if (local) {
    console.log(`[Audio] Using local cache ${surah}:${ayah}`);
    return local;
  }

  return downloadAndCache(surah, ayah);
}

/**
 * Get the next ayah from the database.
 */
async function getNextAyah(surah: number, ayah: number): Promise<PlayOptions | null> {
  const db = await getDB();
  const sql = `SELECT surah, ayah FROM verses WHERE (surah = ? AND ayah = ? + 1) OR (surah = ? + 1 AND ayah = 1) ORDER BY surah, ayah LIMIT 1`;
  const rows = await db.select<{ surah: number; ayah: number }[]>(sql, [surah, ayah, surah]);
  if (rows.length === 0) return null;
  return { surah: rows[0].surah, ayah: rows[0].ayah };
}

/**
 * Stop and cleanup any playing audio.
 */
function cleanupAudio() {
  if (globalAudio) {
    globalAudio.pause();
    globalAudio.src = '';
    globalAudio.load(); // Force release
    globalAudio.onended = null;
    globalAudio.onerror = null;
    globalAudio.oncanplay = null;
    globalAudio = null;
  }
}

export function useQuranAudio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState<{ surah: number; ayah: number } | null>(null);
  const autoPlayRef = useRef(false);

  const play = useCallback(async (opts: PlayOptions) => {
    cleanupAudio();

    const { surah, ayah, autoPlay = false } = opts;
    autoPlayRef.current = autoPlay;

    try {
      const path = await resolveAudioPath(surah, ayah);
      console.log(`[Audio] Playing ${surah}:${ayah} from ${path}`);

      const audio = new Audio(path);
      audio.preload = 'auto';
      globalAudio = audio;

      // Wait for audio to be ready before playing
      await new Promise<void>((resolve, reject) => {
        audio.oncanplay = () => resolve();
        audio.onerror = () => reject(new Error(`Failed to load audio for ${surah}:${ayah}`));
        // Timeout fallback
        setTimeout(() => reject(new Error('Audio load timeout')), 10000);
      });

      audio.onended = async () => {
        setIsPlaying(false);
        if (autoPlayRef.current) {
          const next = await getNextAyah(surah, ayah);
          if (next) {
            await play({ ...next, autoPlay: true });
          }
        }
      };

      audio.onerror = (e) => {
        console.error(`[Audio] Playback error for ${surah}:${ayah}`, e);
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

  return {
    play,
    pause,
    resume,
    stop,
    isPlaying,
    current,
  };
}
