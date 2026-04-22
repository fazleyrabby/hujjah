'use client';

import { useState } from 'react';
import { useIngestion } from '@/hooks/useIngestion';
import ModeIndicator from '@/components/ModeIndicator';
import StatusBanner from '@/components/StatusBanner';
import styles from './ImportPage.module.css';

export default function ImportPage() {
  const { startIngestion, abortIngestion, status, progress, error } = useIngestion();
  const [fileType, setFileType] = useState<'quran' | 'hadith'>('quran');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      startIngestion(file, fileType);
    }
  };

  return (
    <main className="container">
      <ModeIndicator />
      
      <h1 style={{ marginBottom: 'var(--space-xl)' }}>Data Ingestion</h1>
      
      <div className="card">
        <h2 style={{ marginBottom: 'var(--space-md)' }}>Import Settings</h2>
        
        <div style={{ marginBottom: 'var(--space-lg)', display: 'flex', gap: 'var(--space-md)' }}>
          <label>
            <input 
              type="radio" 
              name="fileType" 
              checked={fileType === 'quran'} 
              onChange={() => setFileType('quran')}
              disabled={status !== 'IDLE' && status !== 'COMPLETE' && status !== 'ERROR' && status !== 'ABORTED'}
            /> القرآن الكريم (SQL)
          </label>
          <label>
            <input 
              type="radio" 
              name="fileType" 
              checked={fileType === 'hadith'} 
              onChange={() => setFileType('hadith')}
              disabled={status !== 'IDLE' && status !== 'COMPLETE' && status !== 'ERROR' && status !== 'ABORTED'}
            /> الحديث الشريف (CSV)
          </label>
        </div>

        <div className={styles.uploadArea}>
          <input 
            type="file" 
            id="fileInput"
            className={styles.fileInput}
            accept={fileType === 'quran' ? '.sql' : '.csv'}
            onChange={handleFileChange}
            disabled={status !== 'IDLE' && status !== 'COMPLETE' && status !== 'ERROR' && status !== 'ABORTED'}
          />
          <label htmlFor="fileInput" className="button">
            {status === 'IDLE' ? 'Select File to Ingest' : 'Ingest Another File'}
          </label>
        </div>

        {status !== 'IDLE' && status !== 'COMPLETE' && (
          <div style={{ marginTop: 'var(--space-xl)' }}>
            <p style={{ marginBottom: 'var(--space-sm)' }}>
              Status: <strong>{status}</strong>
            </p>
            <div className={styles.progressTrack}>
              <div 
                className={styles.progressBar} 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p style={{ marginTop: 'var(--space-sm)', textAlign: 'right' }}>{progress}%</p>
            
            <button 
              className="button" 
              style={{ background: 'var(--color-error)', marginTop: 'var(--space-md)' }}
              onClick={abortIngestion}
            >
              Cancel Ingestion
            </button>
          </div>
        )}

        {status === 'COMPLETE' && (
          <div style={{ marginTop: 'var(--space-xl)', color: 'var(--color-accent)' }}>
            <p>✅ Ingestion completed successfully!</p>
          </div>
        )}

        {status === 'ERROR' && (
          <div style={{ marginTop: 'var(--space-xl)', color: 'var(--color-error)' }}>
            <p>❌ Error: {error}</p>
          </div>
        )}
      </div>

      <StatusBanner message={status === 'IDLE' ? 'Ready to import' : `Currently: ${status}`} />
    </main>
  );
}
