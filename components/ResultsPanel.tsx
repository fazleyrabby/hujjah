'use client';

import { SearchResult } from '@/lib/search';
import styles from './ResultsPanel.module.css';

interface ResultsPanelProps {
  results: SearchResult[];
}

export default function ResultsPanel({ results }: ResultsPanelProps) {
  if (results.length === 0) return null;

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Sources</h2>
      <div className={styles.resultsList}>
        {results.map((result, index) => (
          <div key={index} className="card">
            <p className={styles.content}>{result.content}</p>
            <div className={styles.divider}></div>
            <p className={styles.sourceRef}>{result.source_ref}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
