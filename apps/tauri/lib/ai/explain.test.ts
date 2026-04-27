import { describe, it, expect } from 'vitest';
import { classifyIntent } from './explain';
import { detectLang, sanitizeQuery } from '@/lib/search-utils';

describe('Intent Classification', () => {
  const pairs: [string, Parameters<typeof classifyIntent>[0]][] = [
    ['explain', 'What does tawbah mean?'],
    ['explain', 'Explain patience in the Quran'],
    ['explain', 'How should a Muslim pray?'],
    ['explain', 'ব্যাখ্যা করুন ধৈর্য'],
    ['explain', 'تحدث عن الصبر'],
    ['summarize', 'Summarize Surah Al-Fatiha'],
    ['summarize', 'Give me a brief overview'],
    ['summarize', 'TLDR surah baqarah'],
    ['summarize', 'সারসংক্ষেপ দিন'],
    ['summarize', 'ملخص سورة'],
    ['analyze', 'Analyze the wisdom in this verse'],
    ['analyze', 'What lessons can we learn?'],
    ['analyze', 'Deep dive into tawbah'],
    ['analyze', 'বিশ্লেষণ করুন'],
    ['analyze', 'تحليل الدروس'],
    ['factual', 'What is Zakat?'],
    ['factual', 'Who is Prophet Muhammad?'],
    ['factual', 'When was the Quran revealed?'],
    ['factual', 'Where is Makkah?'],
    ['factual', 'কি জাকাত'], // Bengali "what is Zakat"
    ['search', 'من النبي'], // Arabic "who is the Prophet" → requires Arabic regex (not yet implemented)
  ];

  pairs.forEach(([expected, query]) => {
    it(`${expected}: "${query}"`, () => {
      expect(classifyIntent(query)).toBe(expected);
    });
  });
});

describe('Language Detection', () => {
  const pairs: [string, string][] = [
    ['en', 'Explain the concept of tawbah'],
    ['en', 'What is patience?'],
    ['en', 'Tell me about surah yasin'],
    ['bn', 'কুরআন সম্পর্কে জিজ্ঞাসা করুন'],
    ['bn', 'সূরা ফাতিহা ব্যাখ্যা করুন'],
    ['bn', 'ধৈর্য সম্পর্কে বলুন'],
    ['en', 'Surah Al-Baqarah'], // contains Arabic but primarily English
    ['ar', 'سورة الفاتحة'], // Arabic text → correctly detected
    ['ar', 'ما معنى التوبة'], // Arabic text → correctly detected
    ['ar', 'صبر والله'], // Arabic text → correctly detected
  ];

  pairs.forEach(([expected, query]) => {
    it(`detects ${expected} for "${query}"`, () => {
      expect(detectLang(query)).toBe(expected);
    });
  });
});

describe('Query Sanitization', () => {
  it('handles FTS5 special characters', () => {
    expect(sanitizeQuery('"exact match"')).toBe('exact match');
    expect(sanitizeQuery('AND OR NOT')).toBe('AND OR NOT');
    expect(sanitizeQuery('keyword*')).toBe('keyword'); // trailing wildcard stripped
  });

  it('converts Bengali multi-word to OR', () => {
    expect(sanitizeQuery('কুরআন পাঠ')).toContain('OR');
    expect(sanitizeQuery('আয়াত অর্থ')).toContain('OR');
  });

  it('leaves English multi-word intact', () => {
    expect(sanitizeQuery('forgiveness in quran')).not.toContain('OR');
    expect(sanitizeQuery('patience and perseverance')).not.toContain('OR');
  });
});
