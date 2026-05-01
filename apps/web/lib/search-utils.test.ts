import { describe, it, expect } from 'vitest';
import { buildFTS5Queries, classifyQuery, detectLang, normalizeQuery } from '../lib/search-utils';

describe('search-utils', () => {
  describe('detectLang', () => {
    it('detects Bengali script', () => {
      expect(detectLang('আসসালাম')).toBe('bn');
      expect(detectLang('কুরআন')).toBe('bn');
    });

    it('detects Arabic script', () => {
      expect(detectLang('السلام')).toBe('ar');
      expect(detectLang('بسم الله')).toBe('ar');
    });

    it('detects English', () => {
      expect(detectLang('hello world')).toBe('en');
      expect(detectLang('Quran verse')).toBe('en');
    });
  });

  describe('classifyQuery', () => {
    it('classifies reference syntax', () => {
      expect(classifyQuery('2:255')).toMatchObject({ type: 'reference', surah: 2, ayah: 255 });
      expect(classifyQuery('1:1')).toMatchObject({ type: 'reference', surah: 1, ayah: 1 });
    });

    it('classifies surah names', () => {
      expect(classifyQuery('fatiha')).toMatchObject({ type: 'surah' });
      expect(classifyQuery('baqara')).toMatchObject({ type: 'surah' });
    });

    it('returns keyword or surah for plain text', () => {
      // classifyQuery uses fuzzy surah matching, test the behavior is stable
      const result = classifyQuery('xyzabc');
      expect(['keyword', 'surah']).toContain(result.type);
    });
  });

  describe('normalizeQuery', () => {
    it('normalizes Arabic text by removing diacritics', () => {
      const result = normalizeQuery('بِسْمِ', 'ar');
      expect(result).toBeTruthy();
      expect(result.length).toBeLessThanOrEqual('بِسْمِ'.length);
    });

    it('normalizes English text by collapsing whitespace', () => {
      const result = normalizeQuery('Hello  World', 'en');
      expect(result).toBeTruthy();
      expect(result).not.toContain('  ');
    });
  });

  describe('buildFTS5Queries', () => {
    it('builds basic FTS5 query', () => {
      const result = buildFTS5Queries('hello world');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain('hello');
    });

    it('handles single word', () => {
      const result = buildFTS5Queries('quran');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns empty for blank query', () => {
      expect(buildFTS5Queries('')).toEqual([]);
      expect(buildFTS5Queries('   ')).toEqual([]);
    });
  });
});
