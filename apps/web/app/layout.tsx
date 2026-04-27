import type { Metadata } from 'next';
import './globals.css';
import { ErrorBoundary } from '@hujjah/ui';
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
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <ErrorBoundary>
          <AudioProvider>
            {children}
            <AudioPlayer />
          </AudioProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
