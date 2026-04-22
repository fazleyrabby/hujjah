import type { Metadata } from "next";
import "./globals.css";

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
      <body>
        {children}
      </body>
    </html>
  );
}
