import { describe, it, expect } from 'vitest';

describe('explain module (architecture)', () => {
  it('has required exports', async () => {
    const mod = await import('./explain');
    expect(typeof mod.explainVerse).toBe('function');
    expect(typeof mod.explainQuery).toBe('function');
  });

  it('explainVerse returns helpful message for empty input', async () => {
    const { explainVerse } = await import('./explain');
    const result = await explainVerse('test query', []);
    expect(result).toContain("couldn't find");
  });
});
