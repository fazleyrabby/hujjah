import type { Metadata } from 'next';
import './globals.css';
import { ErrorBoundary } from '@hujjah/ui';

export const metadata: Metadata = {
  title: 'Hujjah — Islamic Research',
  description: 'Quran, Hadith, and narrator chain explorer.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
