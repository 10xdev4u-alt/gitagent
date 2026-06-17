/**
 * Tests for the cost utilities.
 */

import { describe, expect, it } from 'vitest';
import { estimateCostUsd, withCost, knownModels } from '../../src/runtime/cost.js';

describe('estimateCostUsd', () => {
  it('returns 0 for zero usage', () => {
    expect(estimateCostUsd('claude-sonnet-4-5', { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it('estimates cost for Claude Sonnet input', () => {
    const cost = estimateCostUsd('claude-sonnet-4-5', { inputTokens: 1_000_000, outputTokens: 0 });
    expect(cost).toBe(3);
  });

  it('estimates cost for Claude Sonnet output', () => {
    const cost = estimateCostUsd('claude-sonnet-4-5', { inputTokens: 0, outputTokens: 1_000_000 });
    expect(cost).toBe(15);
  });

  it('estimates cost for GPT-4o', () => {
    const cost = estimateCostUsd('gpt-4o', { inputTokens: 1_000_000, outputTokens: 0 });
    expect(cost).toBe(2.5);
  });

  it('scales linearly with input tokens', () => {
    const a = estimateCostUsd('claude-sonnet-4-5', { inputTokens: 1000, outputTokens: 0 });
    const b = estimateCostUsd('claude-sonnet-4-5', { inputTokens: 2000, outputTokens: 0 });
    expect(b).toBeCloseTo(a * 2);
  });

  it('falls back to default for unknown model', () => {
    const cost = estimateCostUsd('unknown-model', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    // Default is $1/$3 per MTok
    expect(cost).toBeGreaterThan(0);
  });
});

describe('withCost', () => {
  it('adds costUsd to a TokenUsage', () => {
    const u = withCost({ inputTokens: 1_000_000, outputTokens: 0 }, 'claude-sonnet-4-5');
    expect(u.costUsd).toBe(3);
  });
});

describe('knownModels', () => {
  it('includes popular models', () => {
    const m = knownModels();
    expect(m).toContain('claude-sonnet-4-5');
    expect(m).toContain('gpt-4o');
  });
});
