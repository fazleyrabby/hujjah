'use client';

/**
 * LinkedVerseText
 *
 * Renders AI-generated text with verse references ([2:255], (2:255), 2:255)
 * turned into clickable buttons that navigate to that surah:ayah.
 */

import React from 'react';

interface Props {
  text: string;
  onVerseClick: (surah: number, ayah: number) => void;
  className?: string;
}

// Matches [2:255], (2:255), or bare 2:255 (preceded by space/start, not mid-word)
const REF_RE = /(\[(\d+):(\d+)\]|\((\d+):(\d+)\)|(?<![:\d])(\d+):(\d+)(?!\d))/g;

export default function LinkedVerseText({ text, onVerseClick, className }: Props) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  REF_RE.lastIndex = 0;

  while ((match = REF_RE.exec(text)) !== null) {
    const [full] = match;
    const start = match.index;

    // Text before this match
    if (start > last) {
      parts.push(text.slice(last, start));
    }

    // Extract surah/ayah from whichever capture group matched
    const surah = parseInt(match[2] ?? match[4] ?? match[6], 10);
    const ayah  = parseInt(match[3] ?? match[5] ?? match[7], 10);

    if (!isNaN(surah) && !isNaN(ayah) && surah >= 1 && surah <= 114) {
      parts.push(
        <button
          key={start}
          onClick={() => onVerseClick(surah, ayah)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 text-[11px] font-semibold hover:bg-teal-200 dark:hover:bg-teal-800/60 transition-colors cursor-pointer whitespace-nowrap"
          title={`Go to ${surah}:${ayah}`}
        >
          {surah}:{ayah}
        </button>
      );
    } else {
      parts.push(full);
    }

    last = start + full.length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return <span className={className}>{parts}</span>;
}
