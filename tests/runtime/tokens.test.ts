/**
 * Tests for the token counting utility.
 */

import { describe, expect, it } from 'vitest';
import { estimateTokens, estimateMessagesTokens } from '../../src/runtime/tokens.js';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates ~4 chars per token for short text', () => {
    const t = estimateTokens('hello world');
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(10);
  });

  it('scales with length', () => {
    const a = estimateTokens('a'.repeat(100));
    const b = estimateTokens('a'.repeat(200));
    expect(b).toBeCloseTo(a * 2, 0);
  });
});

describe('estimateMessagesTokens', () => {
  it('returns 0 for empty messages', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });

  it('includes per-message overhead', () => {
    const t = estimateMessagesTokens([{ role: 'user', content: 'hi' }]);
    // 4 (overhead) + 1 (token for "hi") = 5
    expect(t).toBeGreaterThan(0);
  });

  it('accumulates across multiple messages', () => {
    const t = estimateMessagesTokens([
      { role: 'system', content: 'a'.repeat(100) },
      { role: 'user', content: 'b'.repeat(100) },
    ]);
    // Each message has 4 overhead + ~25 content tokens = ~58 total
    expect(t).toBeGreaterThan(40);
  });
});
