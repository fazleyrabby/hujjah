'use client';

import { useState, useEffect } from 'react';
import { SearchInput } from '@/components/ui/SearchInput';
import { ContentCard, CardHeader, CardContent } from '@/components/ui/ContentCard';
import { LoadingSkeleton, AnswerLoading } from '@/components/ui/LoadingSkeleton';
import { ArabicText } from '@/components/ui/ArabicText';
import { useSearch } from '@/hooks/useSearch';
import { useDatabase } from '@/hooks/useDatabase';
import { useRAG } from '@/hooks/useRAG';
import { getDatabase } from '@/lib/db';

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    quran: 0,
    hadith: 0,
    commentary: 0,
    books: 0,
  });
  const { results, loading: searchLoading, error: searchError, performSearch } = useSearch();
  const { db, loading: dbLoading, error: dbError } = useDatabase();
  const { answer, loading: ragLoading, error: ragError, generateAnswer } = useRAG();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (db && !dbLoading) {
      loadStats();
    }
  }, [db, dbLoading]);

  const loadStats = async () => {
    try {
      const dbInstance = await getDatabase();
      const totalRes = await dbInstance.query('SELECT count(*) AS count FROM knowledge');
      const total = parseInt((totalRes.rows[0] as { count: string }).count);

      const quranRes = await dbInstance.query("SELECT count(*) AS count FROM knowledge WHERE source_ref LIKE 'Quran%'");
      const quran = parseInt((quranRes.rows[0] as { count: string }).count);

      const hadithRes = await dbInstance.query("SELECT count(*) AS count FROM knowledge WHERE source_ref LIKE '%Hadith%'");
      const hadith = parseInt((hadithRes.rows[0] as { count: string }).count);

      const booksRes = await dbInstance.query("SELECT count(*) AS count FROM knowledge WHERE category = 'books'");
      const books = parseInt((booksRes.rows[0] as { count: string }).count);

      setStats({
        total,
        quran,
        hadith,
        commentary: total - quran - hadith - books,
        books,
      });
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  };

  const handleSearch = async (query: string) => {
    const searchResults = await performSearch(query);
    if (searchResults && searchResults.length > 0) {
      await generateAnswer(query, searchResults);
    }
  };

  if (!mounted || dbLoading) {
    return (
      <div className="min-h-screen bg-base">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <LoadingSkeleton type="card" />
          <div className="mt-6">
            <LoadingSkeleton type="search" lines={3} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-semibold text-gray-900">Hujjah</h1>
          <p className="text-sm text-gray-500 mt-1">
            Local Islamic Research Tool
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Database Stats */}
        <ContentCard variant="subtle" padding="sm" className="mb-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500">Total:</span>{' '}
              <span className="font-medium text-gray-900">{stats.total.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-gray-500">Quran:</span>{' '}
              <span className="font-medium text-gray-900">{stats.quran.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-gray-500">Hadith:</span>{' '}
              <span className="font-medium text-gray-900">{stats.hadith.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-gray-500">Commentary:</span>{' '}
              <span className="font-medium text-gray-900">{stats.commentary.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-gray-500">Books:</span>{' '}
              <span className="font-medium text-gray-900">{stats.books.toLocaleString()}</span>
            </div>
          </div>
        </ContentCard>

        {/* Search Input */}
        <div className="mb-8">
          <SearchInput
            placeholder="Ask about Quran, Hadith, or Islamic topics..."
            onSearch={handleSearch}
            loading={searchLoading || ragLoading}
          />
        </div>

        {/* Error Display */}
        {(searchError || ragError || dbError) && (
          <ContentCard variant="subtle" className="mb-6 border-error/20 bg-error/5">
            <p className="text-error text-sm">
              {String(searchError || ragError || dbError)}
            </p>
          </ContentCard>
        )}

        {/* Answer Panel */}
        {ragLoading && (
          <div className="mb-6">
            <AnswerLoading phase={answer ? 'complete' : 'searching'} />
          </div>
        )}

        {answer && !ragLoading && (
          <ContentCard variant="elevated" className="mb-6">
            <CardHeader title="Answer" />
            <CardContent>
              <div className="prose prose-gray max-w-none">
                <p className="text-gray-700 leading-relaxed">{answer}</p>
              </div>
            </CardContent>
          </ContentCard>
        )}

        {/* Search Results */}
        {searchLoading && (
          <LoadingSkeleton type="search" lines={5} />
        )}

        {results && results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Results ({results.length})
            </h2>
            {results.map((result: any, index) => (
              <ContentCard key={index} hover>
                <div className="flex items-start gap-3 mb-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-50 text-teal-700 text-xs font-medium flex items-center justify-center">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {result.category}
                      </span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-500">{result.source_ref}</span>
                    </div>
                    <p className="text-gray-900 leading-relaxed">
                      {result.content?.substring(0, 200)}...
                    </p>
                  </div>
                </div>
              </ContentCard>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!searchLoading && !results && !answer && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Start Your Research
            </h3>
            <p className="text-gray-500 max-w-md mx-auto">
              Search across {stats.total.toLocaleString()} records from Quran, Hadith, and scholarly commentary.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
