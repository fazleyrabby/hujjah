'use client';

import { useState, useEffect } from 'react';
import { detectCapability, CapabilityResult } from '@/lib/capability';

export function useCapability() {
  const [capability, setCapability] = useState<CapabilityResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const result = await detectCapability();
      setCapability(result);
      setLoading(false);
    }
    init();
  }, []);

  return { capability, loading };
}
