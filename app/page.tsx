'use client';

import { useState, useEffect } from 'react';
import SearchBox from '@/components/SearchBox';
import ResultsPanel from '@/components/ResultsPanel';
import ModeIndicator from '@/components/ModeIndicator';
import StatusBanner from '@/components/StatusBanner';
import { useSearch } from '@/hooks/useSearch';
import { useDatabase } from '@/hooks/useDatabase';
import { seedDatabase } from '@/lib/seed';

export default function Home() {
  const [systemState, setSystemState] = useState('CHECKING');
  const [statusMessage, setStatusMessage] = useState('Checking your device...');
  const { results, loading: searchLoading, error: searchError, performSearch } = useSearch();
  const { db, loading: dbLoading, error: dbError } = useDatabase();

  useEffect(() => {
    async function init() {
      if (dbLoading) return;
      
      if (dbError) {
        setSystemState('ERROR');
        setStatusMessage('Could not initialize database. Try reloading.');
        return;
      }

      const isSeeded = localStorage.getItem('hujjah_seeded') === 'true';
      if (!isSeeded) {
        setSystemState('SEEDING');
        try {
          await seedDatabase((phase, current, total) => {
            setStatusMessage(`Loading knowledge base... (${current} of ${total})`);
          });
          setSystemState('READY');
          setStatusMessage('Ready to search');
        } catch (err) {
          setSystemState('ERROR');
          setStatusMessage('Could not load knowledge base. Check your connection.');
        }
      } else {
        setSystemState('READY');
        setStatusMessage('Ready to search');
      }
    }
    init();
  }, [dbLoading, dbError]);

  const handleSearch = (query: string) => {
    setSystemState('SEARCHING');
    setStatusMessage('Searching...');
    performSearch(query).then(() => {
      setSystemState('READY');
      setStatusMessage('Ready to search');
    });
  };

  return (
    <main className="container">
      <ModeIndicator />
      
      <h1 style={{ marginBottom: 'var(--space-xl)', fontSize: 'var(--font-size-xxl)' }}>Hujjah</h1>
      
      <SearchBox onSearch={handleSearch} loading={searchLoading || systemState === 'SEEDING'} />
      
      <div style={{ display: 'flex', gap: 'var(--space-2xl)', flexDirection: 'column' }}>
        <ResultsPanel results={results} />
      </div>

      <StatusBanner message={statusMessage} />
    </main>
  );
}
