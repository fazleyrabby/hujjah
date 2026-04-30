'use client';

import { ReactNode, HTMLAttributes } from 'react';
import { motion } from 'framer-motion';

interface ArabicTextProps {
  children: ReactNode;
  size?: 'sm' | 'base' | 'lg' | 'xl';
  showTranslation?: boolean;
  translation?: string;
  className?: string;
}

/**
 * ArabicText - Optimized for Arabic script readability
 * Uses Amiri font with proper line-height and spacing
 */
export function ArabicText({
  children,
  size = 'lg',
  showTranslation = false,
  translation,
  className = '',
  ...props
}: ArabicTextProps) {
  const sizes = {
    sm: 'text-lg md:text-xl',
    base: 'text-xl md:text-2xl',
    lg: 'text-2xl md:text-3xl',
    xl: 'text-3xl md:text-4xl',
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <motion.p
        className={`
          arabic
                    text-gray-900
                   tracking-wide
          ${sizes[size]}
        `.trim()}
        dir="rtl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {children}
      </motion.p>
      
      {showTranslation && translation && (
        <motion.p
          className="text-base md:text-lg text-gray-600 leading-relaxed pl-4 border-l-2 border-teal-600"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          {translation}
        </motion.p>
      )}
    </div>
  );
}

/**
 * ArabicVerse - Single verse with verse number
 */
interface ArabicVerseProps {
  text: string;
  verseNumber: number;
  translation?: string;
  className?: string;
}

export function ArabicVerse({ text, verseNumber, translation, className = '' }: ArabicVerseProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-50 text-teal-700 text-sm font-medium flex items-center justify-center">
          {verseNumber}
        </span>
        <p className="arabic text-2xl md:text-3xl text-gray-900 leading-[2.0] flex-1">
          {text}
        </p>
      </div>
      
      {translation && (
        <p className="text-gray-600 leading-relaxed pl-11">
          {translation}
        </p>
      )}
    </div>
  );
}

/**
 * ArabicHadith - Hadith with Sanad and Matn sections
 */
interface ArabicHadithProps {
  sanad?: string;
  matn: string;
  translation?: string;
  reference?: string;
  className?: string;
}

export function ArabicHadith({ sanad, matn, translation, reference, className = '' }: ArabicHadithProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Sanad (Chain of Narration) */}
      {sanad && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Sanad (Chain)
          </p>
          <p className="arabic text-lg text-gray-700 leading-[2.0]">
            {sanad}
          </p>
        </div>
      )}
      
      {/* Matn (Text) */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Matn (Text)
        </p>
        <p className="arabic text-2xl md:text-3xl text-gray-900 leading-[2.0]">
          {matn}
        </p>
      </div>
      
      {/* Translation */}
      {translation && (
        <div className="border-l-2 border-teal-600 pl-4 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Translation
          </p>
          <p className="text-gray-700 leading-relaxed">
            {translation}
          </p>
        </div>
      )}
      
      {/* Reference */}
      {reference && (
        <p className="text-sm text-gray-500 pt-2 border-t border-gray-100">
          📖 {reference}
        </p>
      )}
    </div>
  );
}

/**
 * ArabicLoading - Skeleton loader for Arabic text
 */
interface ArabicLoadingProps {
  lines?: number;
  showTranslation?: boolean;
}

export function ArabicLoading({ lines = 2, showTranslation = false }: ArabicLoadingProps) {
  return (
    <div className="space-y-4" dir="rtl">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-100 animate-shimmer" />
            <div className="flex-1 space-y-2">
              <div className="h-8 bg-gray-100 rounded animate-shimmer" />
              <div className="h-8 bg-gray-100 rounded animate-shimmer w-3/4" />
            </div>
          </div>
          {showTranslation && (
            <div className="pl-11 space-y-2">
              <div className="h-4 bg-gray-100 rounded animate-shimmer" />
              <div className="h-4 bg-gray-100 rounded animate-shimmer w-5/6" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default ArabicText;
