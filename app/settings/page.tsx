'use client';

import { useState, useEffect, useRef } from 'react';
import { getDatabase, getAyahCount, resetDatabase } from '@/lib/db';
import { seedQuran, SeedProgress } from '@/lib/db/seed';
import { ContentCard } from '@/components/ui/ContentCard';

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [totalAyahs, setTotalAyahs] = useState(0);
  const [seedProgress, setSeedProgress] = useState<SeedProgress | null>(null);
  const [seeding, setSeeding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    refreshCount();
  }, []);

  const refreshCount = async () => {
    try {
      const count = await getAyahCount();
      setTotalAyahs(count);
    } catch (e) {
      setTotalAyahs(0);
    }
  };

  const handleSeed = async () => {
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) {
      alert('Please select quran-uthmani.sql first');
      return;
    }

    setSeeding(true);
    setSeedProgress(null);

    try {
      await seedQuran(files[0], (p) => setSeedProgress(p));
      await refreshCount();
    } catch (e: any) {
      alert('Seed failed: ' + e.message);
    } finally {
      setSeeding(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Delete all Quran data?')) return;
    try {
      await resetDatabase();
      await refreshCount();
      alert('Database reset');
    } catch (e: any) {
      alert('Reset failed: ' + e.message);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-base">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Dev Settings</h1>
        <p className="text-sm text-gray-500 mb-8">Quran-only minimal prototype</p>

        {/* Stats */}
        <ContentCard className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Database</h2>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-4xl font-bold text-gray-900">{totalAyahs.toLocaleString()}</span>
            <span className="text-sm text-gray-500">ayahs in IndexedDB</span>
          </div>
          <div className="text-xs text-gray-400">Vault: idb://hujjah-minimal</div>
        </ContentCard>

        {/* Seed */}
        <ContentCard className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Seed Quran</h2>
          <p className="text-sm text-gray-500 mb-4">
            Select <code className="bg-gray-100 px-1 rounded">quran-uthmani.sql</code> to generate embeddings and insert all 6,236 ayahs.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".sql"
            className="hidden"
            id="quranFile"
          />
          <label htmlFor="quranFile">
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:border-gray-300 transition-colors cursor-pointer mb-4">
              <p className="text-sm text-gray-500">Click to select quran-uthmani.sql</p>
            </div>
          </label>

          <button
            onClick={handleSeed}
            disabled={seeding}
            className="w-full px-4 py-3 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            {seeding ? 'Seeding...' : 'Start Seed'}
          </button>

          {seedProgress && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{seedProgress.message}</span>
                <span className="text-gray-900 font-medium">
                  {seedProgress.current} / {seedProgress.total}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-600 rounded-full transition-all"
                  style={{
                    width: seedProgress.total > 0
                      ? `${(seedProgress.current / seedProgress.total) * 100}%`
                      : '0%'
                  }}
                />
              </div>
            </div>
          )}
        </ContentCard>

        {/* Danger */}
        <ContentCard>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Danger Zone</h2>
          <button
            onClick={handleReset}
            className="w-full px-4 py-3 bg-error text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
          >
            Reset Database
          </button>
        </ContentCard>
      </div>
    </div>
  );
}
