'use client';

import { useCapability } from '@/hooks/useCapability';
import styles from './ModeIndicator.module.css';

export default function ModeIndicator() {
  const { capability, loading } = useCapability();

  if (loading || !capability) return null;

  const modeLabels = {
    FULL_LOCAL: 'Full Local',
    HYBRID: 'Hybrid',
    LITE: 'Lite (Fast & Offline)'
  };

  return (
    <div className={styles.container}>
      <span className={styles.label}>{modeLabels[capability.mode]}</span>
    </div>
  );
}
