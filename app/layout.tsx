import type { Metadata } from "next";
import "./globals.css";
import { AudioProvider } from "@/contexts/AudioContext";
import AudioPlayer from "@/components/AudioPlayer";

export const metadata: Metadata = {
  title: "Hujjah — Local Islamic Research",
  description: "Privacy-focused, offline-capable AI research tool.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AudioProvider>
          {children}
          <AudioPlayer />
        </AudioProvider>
      </body>
    </html>
  );
}
