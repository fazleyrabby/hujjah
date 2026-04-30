import type { Metadata } from 'next';
import './globals.css';
import { ErrorBoundary, ThemeProvider } from '@hujjah/ui';
import { AudioProvider } from '@/contexts/AudioContext';
import AudioPlayer from '@/components/AudioPlayer';

export const metadata: Metadata = {
  title: 'Hujjah — Islamic Research',
  description: 'Quran, Hadith, and narrator chain explorer.',
};

const THEME_SCRIPT = `
(function(){
  function sync(){
    try{
      var d=document.documentElement;
      var v=localStorage.getItem('hujjah-dark');
      if(v==='true') d.classList.add('dark');
      else d.classList.remove('dark');
      var f=localStorage.getItem('hujjah-font-size');
      var s=f==='small'?'0.875':f==='large'?'1.125':'1';
      d.style.setProperty('--font-scale',s);
      var af=localStorage.getItem('hujjah-arabic-font');
      var arabicFont=af==='indopak' ? "'KFGQPC Uthmani Script HAFS', 'Noto Naskh Arabic', serif" : "'Scheherazade New', 'Amiri', 'Noto Naskh Arabic', serif";
      d.style.setProperty('--font-arabic',arabicFont);
    }catch(e){}
  }
  sync();
  window.addEventListener('pageshow',function(e){if(e.persisted)sync();});
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs px-4 py-2 text-center">
          <span>⚠️ This app is under active development — some information may be inaccurate or incomplete.</span>
          {' '}
          <a
            href="https://github.com/fazleyrabby/hujjah/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline underline-offset-2 hover:text-amber-900"
          >
            Report an issue →
          </a>
        </div>
        <ErrorBoundary>
          <ThemeProvider>
            <AudioProvider>
              {children}
              <AudioPlayer />
            </AudioProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
