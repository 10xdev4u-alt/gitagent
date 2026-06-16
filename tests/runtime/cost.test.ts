/**
 * Tests for cost tracking.
 */

import { describe, expect, it } from 'vitest';
import { estimateCostUsd, knownModels, withCost } from '../../src/runtime/cost.js';

describe('estimateCostUsd', () => {
  it('estimates Claude Sonnet 4.5 cost', () => {
    const cost = estimateCostUsd('claude-sonnet-4-5', { inputTokens: 1_000_000, outputTokens: 100_000 });
    // 1M input * $3/MTok + 100K output * $15/MTok = $3 + $1.5 = $4.5
    expect(cost).toBeCloseTo(4.5, 2);
  });

  it('estimates GPT-4o cost', () => {
    const cost = estimateCostUsd('gpt-4o', { inputTokens: 1_000_000, outputTokens: 100_000 });
    // 1M * $2.5 + 100K * $10 = $2.5 + $1 = $3.5
    expect(cost).toBeCloseTo(3.5, 2);
  });

  it('uses conservative default for unknown models', () => {
    const cost = estimateCostUsd('unknown-model', { inputTokens: 1_000_000, outputTokens: 100_000 });
    // 1M * $1 + 100K * $3 = $1.3
    expect(cost).toBeCloseTo(1.3, 2);
  });

  it('handles zero tokens', () => {
    expect(estimateCostUsd('gpt-4o', { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

describe('withCost', () => {
  it('adds costUsd to usage', () => {
    const u = withCost({ inputTokens: 1_000_000, outputTokens: 0 }, 'claude-sonnet-4-5');
    expect(u.costUsd).toBeCloseTo(3, 2);
  });
});

describe('knownModels', () => {
  it('includes popular models', () => {
    const models = knownModels();
    expect(models).toContain('claude-sonnet-4-5');
    expect(models).toContain('gpt-4o');
    expect(models).toContain('gemini-2.5-pro');
  });
});
