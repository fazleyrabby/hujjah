import { describe, it, expect } from 'vitest';

describe('explain module (architecture)', () => {
  it('has required exports', async () => {
    const mod = await import('./explain');
    expect(typeof mod.explainVerse).toBe('function');
    expect(typeof mod.explainQuery).toBe('function');
  });

  it('explainVerse returns insufficient context for empty input', async () => {
    const { explainVerse } = await import('./explain');
    const result = await explainVerse([]);
    expect(result).toContain('Insufficient context');
  });
});
