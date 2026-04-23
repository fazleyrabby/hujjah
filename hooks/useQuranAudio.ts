/**
 * hooks/useQuranAudio.ts
 *
 * Quran Audio Engine
 * - Plays single ayah
 * - Auto-plays next ayah
 * - Caches audio locally via Tauri FS
 * - Streams fallback from alquran.cloud API
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

/**
 * Resolve the local audio path for a verse.
 * Uses Tauri FS to check app data directory.
 */
async function resolveLocalPath(surah: number, ayah: number): Promise<string | null> {
  try {
    const { appDataDir } = await import('@tauri-apps/api/path');
    const { exists } = await import('@tauri-apps/plugin-fs');
    const dir = await appDataDir();
    const filename = `${surah}_${ayah}.mp3`;
    const path = `${dir}/audio/${filename}`;
    const found = await exists(path);
    return found ? path : null;
  } catch {
    return null;
  }
}

/**
 * Download audio from alquran.cloud and cache it locally.
 */
async function downloadAndCache(surah: number, ayah: number): Promise<string> {
  const url = `https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/ar.alafasy`;

  // Fetch the audio URL from the API
  const resp = await fetch(url);
  const data = await resp.json();
  const audioUrl = data?.data?.audio as string;

  if (!audioUrl) {
    throw new Error(`No audio URL returned for ${surah}:${ayah}`);
  }

  // Fetch the actual MP3
  const audioResp = await fetch(audioUrl);
  const blob = await audioResp.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  // Save to Tauri app data directory
  try {
    const { appDataDir } = await import('@tauri-apps/api/path');
    const { mkdir, writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    const dir = await appDataDir();
    const audioDir = `${dir}/audio`;

    // Ensure directory exists
    try {
      await mkdir(audioDir, { recursive: true });
    } catch {
      // Directory may already exist
    }

    const filename = `${surah}_${ayah}.mp3`;
    await writeFile(filename, uint8, {
      dir: BaseDirectory.AppData,
      baseDir: { appData: true },
    });
  } catch (err) {
    console.warn('[Audio] Failed to cache locally, using streamed URL:', err);
  }

  return audioUrl;
}

/**
 * Get the audio path: prefer local, fallback to download + cache.
 */
async function resolveAudioPath(surah: number, ayah: number): Promise<string> {
  const local = await resolveLocalPath(surah, ayah);
  if (local) return local;

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
    globalAudio.onended = null;
    globalAudio.onerror = null;
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

      const audio = new Audio(path);
      globalAudio = audio;

      audio.onended = async () => {
        setIsPlaying(false);
        if (autoPlayRef.current) {
          const next = await getNextAyah(surah, ayah);
          if (next) {
            await play({ ...next, autoPlay: true });
          }
        }
      };

      audio.onerror = () => {
        console.error(`[Audio] Failed to play ${surah}:${ayah}`);
        setIsPlaying(false);
      };

      await audio.play();
      setIsPlaying(true);
      setCurrent({ surah, ayah });
    } catch (err) {
      console.error('[Audio] Playback error:', err);
      setIsPlaying(false);
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
