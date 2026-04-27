import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from './embedding';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it('returns -1 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('handles 384-dim embeddings', () => {
    const a = new Float32Array(384).fill(0.1);
    const b = new Float32Array(384).fill(0.1);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });
});
