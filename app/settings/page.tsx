'use client';

import { useState, useEffect, useRef } from 'react';
import { getDatabase } from '@/lib/db';
import { useIngestion, IngestionType } from '@/hooks/useIngestion';
import { ContentCard } from '@/components/ui/ContentCard';

interface FileToImport {
  file: File;
  type: IngestionType;
  name: string;
  size: number;
  status: 'pending' | 'importing' | 'complete' | 'error';
  error?: string;
}

interface DbStats {
  total: number;
  byCategory: { category: string; count: number }[];
  quranCount: number;
  hadithCount: number;
  commentaryCount: number;
  booksCount: number;
}

// Source data expectations
const SOURCE_DATA = {
  quran: { label: 'Quran Arabic', expected: 6236, icon: '📖' },
  hadith: { label: 'Hadith', expected: 672794, icon: '📜' },
  commentary: { label: 'Commentary/Translations', expected: 685960, icon: '📝' },
  books: { label: 'Books Metadata', expected: 956, icon: '📚' },
};

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'import' | 'danger'>('overview');
  
  const { startIngestion, abortIngestion, status, progress, error } = useIngestion();
  const [fileType, setFileType] = useState<IngestionType>('quran');
  const [queue, setQueue] = useState<FileToImport[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(-1);
  const [syncing, setSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); loadStats(); }, []);

  useEffect(() => {
    if (status === 'COMPLETE' && currentFileIndex >= 0) {
      setQueue(prev => prev.map((f, i) => i === currentFileIndex ? { ...f, status: 'complete' as const } : f));
      if (currentFileIndex < queue.length - 1) {
        const nextIndex = currentFileIndex + 1;
        setCurrentFileIndex(nextIndex);
        startIngestion(queue[nextIndex].file, queue[nextIndex].type);
      } else {
        setSyncing(false);
        loadStats();
      }
    } else if (status === 'ERROR' && currentFileIndex >= 0) {
      setQueue(prev => prev.map((f, i) => i === currentFileIndex ? { ...f, status: 'error' as const, error: error || 'Unknown' } : f));
      if (currentFileIndex < queue.length - 1) {
        const nextIndex = currentFileIndex + 1;
        setCurrentFileIndex(nextIndex);
        startIngestion(queue[nextIndex].file, queue[nextIndex].type);
      } else {
        setSyncing(false);
      }
    }
  }, [status, currentFileIndex, queue.length, error, startIngestion]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const db = await getDatabase();
      const totalRes = await db.query('SELECT count(*) AS count FROM knowledge');
      const total = parseInt((totalRes.rows[0] as { count: string }).count);

      const catRes = await db.query('SELECT category, count(*) as cnt FROM knowledge GROUP BY category ORDER BY cnt DESC');
      const byCategory = catRes.rows.map(r => ({
        category: (r as { category: string }).category,
        count: parseInt((r as { cnt: string }).cnt)
      }));

      const quranRes = await db.query("SELECT count(*) AS count FROM knowledge WHERE source_ref LIKE 'Quran%'");
      const quranCount = parseInt((quranRes.rows[0] as { count: string }).count);

      const hadithRes = await db.query("SELECT count(*) AS count FROM knowledge WHERE source_ref LIKE '%Hadith%'");
      const hadithCount = parseInt((hadithRes.rows[0] as { count: string }).count);

      const booksRes = await db.query("SELECT count(*) AS count FROM knowledge WHERE category = 'books'");
      const booksCount = parseInt((booksRes.rows[0] as { count: string }).count);

      setDbStats({
        total,
        byCategory,
        quranCount,
        hadithCount,
        commentaryCount: total - quranCount - hadithCount - booksCount,
        booksCount
      });
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) { console.error('Failed to load stats:', e); }
    finally { setLoading(false); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles: FileToImport[] = Array.from(files).map(file => ({
        file, type: fileType, name: file.name, size: file.size, status: 'pending' as const
      }));
      setQueue(prev => [...prev, ...newFiles]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSyncAll = async () => {
    const pendingFiles = queue.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;
    setSyncing(true);
    setCurrentFileIndex(0);
    startIngestion(pendingFiles[0].file, pendingFiles[0].type);
  };

  const handleClearQueue = () => { setQueue([]); setCurrentFileIndex(-1); setSyncing(false); };
  const handleRemoveFile = (index: number) => { setQueue(prev => prev.filter((_, i) => i !== index)); };
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleReset = async () => {
    if (!confirm('Are you sure? This will DELETE ALL data from the database.')) return;
    try {
      const db = await getDatabase();
      await db.exec(`
        DROP TABLE IF EXISTS knowledge CASCADE;
        CREATE TABLE knowledge (
          id          SERIAL PRIMARY KEY,
          content     TEXT        NOT NULL,
          source_ref  TEXT        NOT NULL,
          category    TEXT        NOT NULL,
          embedding   VECTOR(384) NOT NULL,
          created_at  TIMESTAMP   DEFAULT NOW()
        );
        CREATE INDEX idx_knowledge_category ON knowledge(category);
        CREATE INDEX idx_knowledge_embedding ON knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
      `);
      localStorage.removeItem('hujjah_seeded');
      alert('Database reset successfully!');
      loadStats();
    } catch (err: any) { alert('Error: ' + err.message); }
  };

  const getSyncRow = (label: string, actual: number, expected: number, icon: string) => {
    const isSynced = actual >= expected;
    const pct = expected > 0 ? Math.min(100, Math.round((actual / expected) * 100)) : 0;
    return (
      <div key={label} className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>{icon}</span>
            <span className="font-medium text-gray-900">{label}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 tabular-nums">{actual.toLocaleString()} / {expected.toLocaleString()}</span>
            {isSynced ? (
              <span className="text-xs font-medium text-success bg-green-50 px-2 py-0.5 rounded-full">Synced</span>
            ) : actual > 0 ? (
              <span className="text-xs font-medium text-warning bg-amber-50 px-2 py-0.5 rounded-full">{pct}%</span>
            ) : (
              <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">Missing</span>
            )}
          </div>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${isSynced ? 'bg-success' : actual > 0 ? 'bg-warning' : 'bg-gray-200'}`} style={{ width: pct + '%' }} />
        </div>
      </div>
    );
  };

  if (!mounted) return null;

  const pendingCount = queue.filter(f => f.status === 'pending').length;
  const completeCount = queue.filter(f => f.status === 'complete').length;
  const errorCount = queue.filter(f => f.status === 'error').length;

  return (
    <div className="min-h-screen bg-base">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Dev Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Database analytics and data import for MVP development</p>
        </div>

        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-6 w-fit">
          {[
            { id: 'overview' as const, label: 'Analytics' },
            { id: 'import' as const, label: 'Import Data' },
            { id: 'danger' as const, label: 'Danger Zone' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ANALYTICS TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Browser Database Status */}
            <ContentCard>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Browser Database</h2>
                  <p className="text-xs text-gray-500 mt-1">IndexedDB: idb://hujjah-vault</p>
                </div>
                <div className="flex items-center gap-2">
                  {lastUpdated && <span className="text-xs text-gray-400">Updated {lastUpdated}</span>}
                  <button onClick={loadStats} disabled={loading}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
                    {loading ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
              </div>

              {dbStats ? (
                <div className="space-y-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-gray-900">{dbStats.total.toLocaleString()}</span>
                    <span className="text-sm text-gray-500">records in browser</span>
                  </div>

                  <div className="space-y-4">
                    {getSyncRow(SOURCE_DATA.quran.label, dbStats.quranCount, SOURCE_DATA.quran.expected, SOURCE_DATA.quran.icon)}
                    {getSyncRow(SOURCE_DATA.hadith.label, dbStats.hadithCount, SOURCE_DATA.hadith.expected, SOURCE_DATA.hadith.icon)}
                    {getSyncRow(SOURCE_DATA.commentary.label, dbStats.commentaryCount, SOURCE_DATA.commentary.expected, SOURCE_DATA.commentary.icon)}
                    {getSyncRow(SOURCE_DATA.books.label, dbStats.booksCount, SOURCE_DATA.books.expected, SOURCE_DATA.books.icon)}
                  </div>

                  {dbStats.byCategory.length > 0 && (
                    <div className="pt-4 border-t border-gray-100">
                      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Categories</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {dbStats.byCategory.map(cat => (
                          <div key={cat.category} className="p-3 bg-gray-50 rounded-lg">
                            <div className="text-xl font-bold text-gray-900">{cat.count.toLocaleString()}</div>
                            <div className="text-xs text-gray-500 capitalize">{cat.category}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Loading database stats...</p>
              )}
            </ContentCard>

            {/* Source Files Status */}
            <ContentCard>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Source Files Available</h2>
              <p className="text-sm text-gray-500 mb-4">Data available on disk for import. Use the Import Data tab to load into browser.</p>
              <div className="space-y-3">
                {[
                  { name: 'quran-uthmani.sql', size: '1.4 MB', records: '6,236 verses', icon: '📖' },
                  { name: 'sanadset.csv (chunks)', size: '1.3 GB', records: '672,794 hadiths', icon: '📜' },
                  { name: 'global quran data/*.json', size: '~150 MB', records: '110 files, 53 languages', icon: '📝' },
                  { name: 'books.csv', size: '47 KB', records: '956 books', icon: '📚' },
                ].map(file => (
                  <div key={file.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span>{file.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{file.name}</p>
                        <p className="text-xs text-gray-500">{file.records}</p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">{file.size}</span>
                  </div>
                ))}
              </div>
            </ContentCard>

            {/* Dev Notes */}
            <ContentCard variant="subtle">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Dev Notes</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>Browser DB (IndexedDB) is separate from Node.js filesystem DB</li>
                <li>Pre-seeded vault is at <code className="bg-gray-100 px-1 rounded text-xs">public/hujjah-vault/</code></li>
                <li>Run <code className="bg-gray-100 px-1 rounded text-xs">npm run seed:vault</code> to update filesystem DB via Node.js</li>
                <li>Run <code className="bg-gray-100 px-1 rounded text-xs">npm run package:vault</code> to repackage for deployment</li>
                <li>Use Import Data tab to load files directly into browser DB</li>
              </ul>
            </ContentCard>
          </div>
        )}

        {/* IMPORT TAB */}
        {activeTab === 'import' && (
          <div className="space-y-6">
            <ContentCard>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Import Data</h2>
              <div className="flex flex-wrap gap-4 mb-6">
                {[
                  { value: 'quran' as const, label: 'Quran (SQL)' },
                  { value: 'hadith' as const, label: 'Hadith (CSV)' },
                  { value: 'commentary' as const, label: 'Commentary (JSON)' },
                  { value: 'books' as const, label: 'Books List (CSV)' },
                ].map(option => (
                  <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="fileType" checked={fileType === option.value}
                      onChange={() => setFileType(option.value)} disabled={syncing}
                      className="w-4 h-4 text-teal-600 focus:ring-teal-500" />
                    <span className="text-sm text-gray-700">{option.label}</span>
                  </label>
                ))}
              </div>

              <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center hover:border-gray-300 transition-colors">
                <input ref={fileInputRef} type="file" id="fileInput" className="hidden"
                  accept={fileType === 'quran' ? '.sql' : fileType === 'hadith' || fileType === 'books' ? '.csv' : '.json'}
                  onChange={handleFileChange} multiple disabled={syncing} />
                <label htmlFor="fileInput" className="cursor-pointer">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">Select Files</p>
                  <p className="text-xs text-gray-500">You can select multiple files at once</p>
                </label>
              </div>

              {fileType === 'hadith' && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <strong>Tip:</strong> For large files, use the split chunks in <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded text-xs">Sanadset 650K/chunks/</code>
                  </p>
                </div>
              )}
            </ContentCard>

            {queue.length > 0 && (
              <ContentCard>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Import Queue</h2>
                    <p className="text-sm text-gray-500">{queue.length} files</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleSyncAll} disabled={syncing || pendingCount === 0}
                      className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50">
                      {syncing ? 'Syncing...' : `Sync All (${pendingCount})`}
                    </button>
                    <button onClick={handleClearQueue} disabled={syncing}
                      className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors">
                      Clear
                    </button>
                  </div>
                </div>

                <div className="flex gap-4 mb-4 text-sm">
                  <span className="text-gray-500">{completeCount} complete</span>
                  <span className="text-gray-500">{pendingCount} pending</span>
                  {errorCount > 0 && <span className="text-error">{errorCount} errors</span>}
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {queue.map((item, index) => (
                    <div key={item.name + index}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        index === currentFileIndex ? 'bg-teal-50 border-teal-200' :
                        item.status === 'complete' ? 'bg-green-50 border-green-200' :
                        item.status === 'error' ? 'bg-red-50 border-red-200' :
                        'bg-gray-50 border-gray-200'
                      }`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(item.size)}</p>
                      </div>
                      <div className="text-right ml-4">
                        {item.status === 'pending' && <span className="text-xs text-gray-500">Pending</span>}
                        {item.status === 'importing' && index === currentFileIndex && <span className="text-xs text-teal-600">{progress}%</span>}
                        {item.status === 'complete' && <span className="text-xs text-green-600">Complete</span>}
                        {item.status === 'error' && <span className="text-xs text-error">{item.error}</span>}
                      </div>
                      {item.status === 'pending' && !syncing && (
                        <button className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors" onClick={() => handleRemoveFile(index)}>x</button>
                      )}
                    </div>
                  ))}
                </div>

                {syncing && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-600">Processing file {currentFileIndex + 1} of {queue.length}</span>
                      <span className="text-gray-900 font-medium">{progress}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-600 rounded-full transition-all duration-300" style={{ width: progress + '%' }} />
                    </div>
                    <button className="mt-3 px-4 py-2 bg-red-50 text-error text-sm font-medium rounded-lg hover:bg-red-100 transition-colors" onClick={abortIngestion}>
                      Cancel
                    </button>
                  </div>
                )}
              </ContentCard>
            )}
          </div>
        )}

        {/* DANGER TAB */}
        {activeTab === 'danger' && (
          <ContentCard className="max-w-lg">
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Delete All Data</h2>
                <p className="text-sm text-gray-500 leading-relaxed">
                  This will permanently delete all imported data from the browser OPFS storage and start fresh. This action cannot be undone.
                </p>
              </div>
            </div>
            <button onClick={handleReset}
              className="w-full px-4 py-3 bg-error text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Reset Database
            </button>
          </ContentCard>
        )}
      </div>
    </div>
  );
}
