'use client';

import styles from './AnswerPanel.module.css';

interface AnswerPanelProps {
  answer: string;
  loading: boolean;
}

export default function AnswerPanel({ answer, loading }: AnswerPanelProps) {
  if (!answer && !loading) return null;

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Answer</h2>
      <div className="card">
        {loading ? (
          <p className={styles.loading}>Preparing answer...</p>
        ) : (
          <p className={styles.answerText}>{answer}</p>
        )}
      </div>
    </div>
  );
}
