import { describe, it, expect } from 'vitest';
import { classifyQuery, sanitizeQuery, detectLang, type ClassifiedQuery } from './search-utils';

describe('classifyQuery', () => {
  it('classifies reference queries (surah:ayah)', () => {
    const r = classifyQuery('2:255');
    expect(r.type).toBe('reference');
    expect(r.surah).toBe(2);
    expect(r.ayah).toBe(255);
  });

  it('classifies reference queries with large numbers', () => {
    const r = classifyQuery('114:6');
    expect(r.type).toBe('reference');
    expect(r.surah).toBe(114);
    expect(r.ayah).toBe(6);
  });

  it('classifies command queries (@quran keyword)', () => {
    const r = classifyQuery('@quran mercy');
    expect(r.type).toBe('command');
    expect(r.command).toBe('quran');
    expect(r.subQuery).toBe('mercy');
  });

  it('classifies command queries (@hadith keyword)', () => {
    const r = classifyQuery('@hadith prayer');
    expect(r.type).toBe('command');
    expect(r.command).toBe('hadith');
    expect(r.subQuery).toBe('prayer');
  });

  it('classifies surah name candidates', () => {
    const r = classifyQuery('Al-Baqarah');
    expect(r.type).toBe('surah');
  });

  it('classifies general keywords', () => {
    const r = classifyQuery('patience and mercy');
    expect(r.type).toBe('keyword');
  });

  it('classifies Bengali keywords', () => {
    const r = classifyQuery('ধৈর্য');
    expect(r.type).toBe('keyword');
  });

  it('handles empty strings', () => {
    const r = classifyQuery('');
    expect(r.type).toBe('keyword');
  });

  it('trims whitespace', () => {
    const r = classifyQuery('  2:255  ');
    expect(r.type).toBe('reference');
    expect(r.raw).toBe('2:255');
  });
});

describe('sanitizeQuery', () => {
  it('removes FTS5 special characters', () => {
    expect(sanitizeQuery('mercy*')).toBe('mercy');
    expect(sanitizeQuery('"patience"')).toBe('patience');
    expect(sanitizeQuery('test{ing}')).toBe('testing');
  });

  it('collapses multiple spaces', () => {
    expect(sanitizeQuery('mercy   and   patience')).toBe('mercy and patience');
  });

  it('trims whitespace', () => {
    expect(sanitizeQuery('  mercy  ')).toBe('mercy');
  });

  it('converts Bengali conjunctions to OR', () => {
    expect(sanitizeQuery('সালাত ও সবর')).toBe('সালাত OR সবর');
    expect(sanitizeQuery('ধৈর্য এবং নামাজ')).toBe('ধৈর্য OR নামাজ');
  });

  it('converts Bengali multi-word queries to OR', () => {
    expect(sanitizeQuery('রহমত করুনা')).toBe('রহমত OR করুনা');
  });

  it('leaves English multi-word queries intact', () => {
    expect(sanitizeQuery('mercy and patience')).toBe('mercy and patience');
  });
});

describe('detectLang', () => {
  it('returns en for English text', () => {
    expect(detectLang('mercy and patience')).toBe('en');
    expect(detectLang('verses about guidance')).toBe('en');
  });

  it('returns bn for Bengali text', () => {
    expect(detectLang('রহমত')).toBe('bn');
    expect(detectLang('কুরআনের আয়াত')).toBe('bn');
    expect(detectLang('ধৈর্য ও সবর')).toBe('bn');
  });

  it('returns bn for mixed with Bengali characters', () => {
    expect(detectLang('I want রহমত')).toBe('bn');
  });

  it('returns en for empty string', () => {
    expect(detectLang('')).toBe('en');
    expect(detectLang('   ')).toBe('en');
  });

  it('returns en for numbers/symbols', () => {
    expect(detectLang('2:255')).toBe('en');
    expect(detectLang('@hadith prayer')).toBe('en');
  });
});
