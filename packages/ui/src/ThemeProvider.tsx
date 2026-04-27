'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface ThemeContextValue {
  darkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (v: boolean) => void;
  fontSize: 'small' | 'medium' | 'large';
  setFontSize: (v: 'small' | 'medium' | 'large') => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  darkMode: false,
  toggleDarkMode: () => {},
  setDarkMode: () => {},
  fontSize: 'medium',
  setFontSize: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkModeState] = useState(false);
  const [fontSize, setFontSizeState] = useState<'small' | 'medium' | 'large'>('medium');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('hujjah-dark');
    const savedFont = localStorage.getItem('hujjah-font-size') as 'small' | 'medium' | 'large' | null;
    setDarkModeState(saved === 'true');
    setFontSizeState(savedFont ?? 'medium');
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const d = document.documentElement;
    if (darkMode) d.classList.add('dark');
    else d.classList.remove('dark');
    localStorage.setItem('hujjah-dark', String(darkMode));
  }, [darkMode, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const scale = fontSize === 'small' ? '0.875' : fontSize === 'large' ? '1.125' : '1';
    document.documentElement.style.setProperty('--font-scale', scale);
    localStorage.setItem('hujjah-font-size', fontSize);
  }, [fontSize, mounted]);

  const toggleDarkMode = useCallback(() => {
    setDarkModeState(v => !v);
  }, []);

  const setDarkMode = useCallback((v: boolean) => {
    setDarkModeState(v);
  }, []);

  const setFontSize = useCallback((v: 'small' | 'medium' | 'large') => {
    setFontSizeState(v);
  }, []);

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode, setDarkMode, fontSize, setFontSize }}>
      {children}
    </ThemeContext.Provider>
  );
}
