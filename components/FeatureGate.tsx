'use client';

import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface FeatureGateProps {
  children: React.ReactNode;
  dbName: string;
  title?: string;
  description?: string;
  downloadUrl?: string;
  expectedHash?: string;
}

interface DownloadProgressPayload {
  downloaded: number;
  total: number;
  percent: number;
  status: string;
}

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function FeatureGate({
  children,
  dbName,
  title = 'Research Data Required',
  description = 'This feature requires additional data to be downloaded.',
  downloadUrl,
  expectedHash = '',
}: FeatureGateProps) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgressPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkReady = useCallback(async () => {
    try {
      const result = await invoke<string>('hydrate_database', { target: dbName });
      setReady(result === 'ready');
    } catch {
      setReady(false);
    }
  }, [dbName]);

  useEffect(() => {
    checkReady();
  }, [checkReady]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      const fn = await listen<DownloadProgressPayload>('download-progress', (event) => {
        setProgress(event.payload);
        if (event.payload.status === 'completed') {
          setDownloading(false);
          checkReady();
        }
      });
      unlisten = fn;
    };

    setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, [checkReady]);

  const handleHydrate = async () => {
    setHydrating(true);
    setError(null);
    try {
      const result = await invoke<string>('hydrate_database', { target: dbName });
      if (result === 'ready' || result === 'hydrated') {
        setReady(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setHydrating(false);
    }
  };

  const handleDownload = async () => {
    if (!downloadUrl) return;
    setDownloading(true);
    setError(null);
    try {
      await invoke<string>('download_research_data', {
        url: downloadUrl,
        expectedHash,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setDownloading(false);
    }
  };

  if (ready === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-teal-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (ready) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center py-16 px-6">
      <div className="w-full max-w-md bg-neutral-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl p-8">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
          <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        </div>

        <h3 className="text-center text-sm font-medium text-gray-900 dark:text-white mb-2 tracking-wide font-mono">
          {title}
        </h3>

        <p className="text-center text-xs text-gray-500 dark:text-gray-400 mb-6 leading-relaxed font-mono">
          {description}
        </p>

        {(hydrating || downloading) && progress && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-mono">
                {progress.status}
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                {progress.percent.toFixed(1)}%
              </span>
            </div>
            <div className="h-px bg-gray-200 dark:bg-zinc-700 w-full">
              <div
                className="h-px bg-teal-600 dark:bg-teal-400 transition-all duration-300"
                style={{ width: `${Math.min(progress.percent, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[9px] text-gray-400 dark:text-gray-500 font-mono">
                {fmtBytes(progress.downloaded)}
              </span>
              <span className="text-[9px] text-gray-400 dark:text-gray-500 font-mono">
                {fmtBytes(progress.total)}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-[10px] text-red-700 dark:text-red-400 leading-relaxed font-mono">
              {error}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={handleHydrate}
            disabled={hydrating || downloading}
            className="w-full px-4 py-2.5 text-xs font-medium border border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40 font-mono"
          >
            {hydrating ? 'Extracting...' : 'Extract from Bundle'}
          </button>

          {downloadUrl && (
            <button
              onClick={handleDownload}
              disabled={hydrating || downloading}
              className="w-full px-4 py-2.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors disabled:opacity-40 font-mono"
            >
              {downloading ? 'Downloading...' : 'Download Research Data'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
