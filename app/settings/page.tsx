'use client';

import { useState, useEffect } from 'react';
import { getQuranStats, purgeLegacyStorage, getDB } from '@/lib/db';
import { getModelStatus, getModelStatusLabel, initAIEnvironment } from '@/lib/ai';

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({ verses: 0, translations: 0, languages: 0 });
  const [loading, setLoading] = useState(false);
  const [modelStatus, setModelStatus] = useState(getModelStatusLabel());

  useEffect(() => {
    setMounted(true);
    loadStats();
    initAIEnvironment().then(() => {
      setModelStatus(getModelStatusLabel());
    });
  }, []);

  const loadStats = async () => {
    try {
      const s = await getQuranStats();
      setStats(s);
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  };

  const handlePurge = async () => {
    if (!confirm('Purge legacy IndexedDB and reset the Quran database?')) return;
    setLoading(true);
    try {
      await purgeLegacyStorage();
      const db = await getDB();
      await db.execute('DELETE FROM translations;');
      await db.execute('DELETE FROM verses;');
      await db.execute('VACUUM;');
      await loadStats();
      alert('Storage purged and database reset');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert('Error: ' + message);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-base">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Dev Settings</h1>
        <p className="text-sm text-gray-500 mb-8">Native SQLite via Tauri — Quran Vault</p>

        {/* Stats */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Database</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{stats.verses.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Arabic verses</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-teal-600">{stats.translations.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Translations</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-amber-600">{stats.languages}</div>
              <div className="text-xs text-gray-500">Languages</div>
            </div>
          </div>
          <p className="text-xs text-gray-400">FTS5 full-text index on translations</p>
        </div>

        {/* Model Status */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">AI Model Status</h2>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              modelStatus === 'Offline (Bundled)' ? 'bg-green-500' : 'bg-amber-500'
            }`} />
            <span className="text-sm font-medium text-gray-900">{modelStatus}</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Model: <code className="bg-gray-100 px-1 rounded">all-MiniLM-L6-v2</code> (quantized ONNX)
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Source: Local bundle — 100% offline, no CDN calls.
          </p>
        </div>

        {/* Seeding Info */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pre-baked Database</h2>
          <p className="text-sm text-gray-600 mb-4">
            The unified Quran vault is pre-built on the dev machine using:
          </p>
          <code className="block bg-gray-900 text-gray-100 text-xs p-3 rounded-lg mb-4">
            npm run build:quran
          </code>
          <p className="text-sm text-gray-600 mb-2">
            This generates <code className="bg-gray-100 px-1 rounded">src-tauri/resources/hujjah-quran.db</code> with:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
            <li>All 6,236 Arabic verses</li>
            <li>68K+ translations across 2 languages (en, bn)</li>
            <li>FTS5 full-text index (unicode61 tokenizer)</li>
            <li>56K+ vector embeddings (384-dim) for English</li>
          </ul>
        </div>

        {/* Danger Zone */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Danger Zone</h2>
          <button
            onClick={handlePurge}
            disabled={loading}
            className="w-full px-4 py-3 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Purging...' : 'Purge Legacy & Reset DB'}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Clears old IndexedDB (PGlite) and resets the native SQLite Quran database.
          </p>
        </div>
      </div>
    </div>
  );
}
