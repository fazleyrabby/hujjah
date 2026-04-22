'use client';

import { useState, useEffect } from 'react';
import { getDatabase } from '@/lib/db';
import type { PGlite } from '@electric-sql/pglite';

export function useDatabase() {
  const [db, setDb] = useState<PGlite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const instance = await getDatabase();
        setDb(instance);
      } catch (err) {
        console.error('Failed to initialize database:', err);
        setError(err instanceof Error ? err : new Error('Unknown database error'));
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  return { db, loading, error };
}
