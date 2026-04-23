'use client';

import { useState, useEffect } from 'react';
import { getStats, sqlQuery, purgeLegacyStorage } from '@/lib/db';
import { ContentCard } from '@/components/ui/ContentCard';

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({ total: 0, quran: 0, hadith: 0, books: 0 });
  const [dbPath, setDbPath] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const s = await getStats();
      setStats(s);
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  };

  const handlePurge = async () => {
    if (!confirm('Purge legacy IndexedDB and reset native DB?')) return;
    setLoading(true);
    try {
      await purgeLegacyStorage();
      // Reset native DB
      await sqlQuery(`
        DELETE FROM content_store;
        DELETE FROM fts_idx;
        VACUUM;
      `);
      await loadStats();
      alert('Storage purged and database reset');
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-base">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Dev Settings</h1>
        <p className="text-sm text-gray-500 mb-8">Native SQLite via Tauri</p>

        {/* Stats */}
        <ContentCard className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Database</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Total passages</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-teal-600">{stats.quran.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Quran ayahs</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-amber-600">{stats.hadith.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Hadith</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-600">{stats.books.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Books</div>
            </div>
          </div>
          <p className="text-xs text-gray-400">Native SQLite with FTS5</p>
        </ContentCard>

        {/* Seeding Info */}
        <ContentCard className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pre-baked Database</h2>
          <p className="text-sm text-gray-600 mb-4">
            The native SQLite database is pre-built on the dev machine using:
          </p>
          <code className="block bg-gray-900 text-gray-100 text-xs p-3 rounded-lg mb-4">
            npm run seed:native
          </code>
          <p className="text-sm text-gray-600 mb-2">
            This generates <code className="bg-gray-100 px-1 rounded">src-tauri/resources/hujjah.db</code> with:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
            <li>All 6,236 Quran ayahs</li>
            <li>Top 10 Hadith books (~50K hadiths)</li>
            <li>957 book metadata entries</li>
            <li>FTS5 full-text index</li>
          </ul>
        </ContentCard>

        {/* Danger Zone */}
        <ContentCard>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Danger Zone</h2>
          <button
            onClick={handlePurge}
            disabled={loading}
            className="w-full px-4 py-3 bg-error text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Purging...' : 'Purge Legacy & Reset DB'}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Clears old IndexedDB (PGlite) and resets the native SQLite database.
          </p>
        </ContentCard>
      </div>
    </div>
  );
}
