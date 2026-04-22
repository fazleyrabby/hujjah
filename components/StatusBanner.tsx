'use client';

import styles from './StatusBanner.module.css';

interface StatusBannerProps {
  message: string;
}

export default function StatusBanner({ message }: StatusBannerProps) {
  if (!message) return null;

  return (
    <div className={styles.container}>
      <p className={styles.text}>{message}</p>
    </div>
  );
}
