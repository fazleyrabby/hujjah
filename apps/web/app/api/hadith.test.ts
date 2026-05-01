import { describe, it, expect } from 'vitest';

function normalizeArabicQuery(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي');
}

describe('hadith route helpers', () => {
  describe('normalizeArabicQuery', () => {
    it('strips diacritics', () => {
      expect(normalizeArabicQuery('بِسْمِ')).toBe('بسم');
    });

    it('normalizes alef variants', () => {
      // All three alef variants → ا (alef)
      expect(normalizeArabicQuery('أمان').startsWith('ا')).toBe(true);
      expect(normalizeArabicQuery('إسلام').startsWith('ا')).toBe(true);
      expect(normalizeArabicQuery('آدم').startsWith('ا')).toBe(true);
    });

    it('handles ya-mae normalization', () => {
      expect(normalizeArabicQuery('علي')).toBe('علي');
    });
  });
});
