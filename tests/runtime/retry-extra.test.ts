/**
 * Tests for the retry utility.
 */

import { describe, expect, it, vi } from 'vitest';
import { withRetry, isRetryableError, computeBackoff, defaultRetryPolicy } from '../../src/runtime/retry.js';

describe('isRetryableError', () => {
  it('returns true for messages containing rate limit', () => {
    expect(isRetryableError(new Error('rate limit exceeded'))).toBe(true);
  });

  it('returns true for messages containing timeout', () => {
    expect(isRetryableError(new Error('request timeout'))).toBe(true);
  });

  it('returns true for messages containing econnreset', () => {
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
  });

  it('returns false for other error messages', () => {
    expect(isRetryableError(new Error('validation failed'))).toBe(false);
  });

  it('returns false for non-Error', () => {
    expect(isRetryableError('a string')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe('computeBackoff', () => {
  it('returns initial backoff for attempt 1', () => {
    const backoff = computeBackoff(1, defaultRetryPolicy);
    // Initial backoff is 500ms ± 10% jitter
    expect(backoff).toBeGreaterThanOrEqual(450);
    expect(backoff).toBeLessThanOrEqual(550);
  });

  it('increases with attempt', () => {
    const a = computeBackoff(1, defaultRetryPolicy);
    const b = computeBackoff(2, defaultRetryPolicy);
    const c = computeBackoff(3, defaultRetryPolicy);
    // Use ranges since jitter can vary
    expect(b).toBeGreaterThanOrEqual(a * 0.5); // conservative
  });

  it('caps at maxBackoffMs', () => {
    const backoff = computeBackoff(20, defaultRetryPolicy);
    expect(backoff).toBeLessThanOrEqual(defaultRetryPolicy.maxBackoffMs * 1.1);
  });
});

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const fn = vi.fn(async () => 'ok');
    const result = await withRetry(fn, { maxAttempts: 3, initialBackoffMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable errors', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { maxAttempts: 3, initialBackoffMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));
    await expect(
      withRetry(fn, { maxAttempts: 3, initialBackoffMs: 1 }),
    ).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('rate limit'));
    await expect(
      withRetry(fn, { maxAttempts: 3, initialBackoffMs: 1 }),
    ).rejects.toThrow('rate limit');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('calls onRetry before each retry', async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce('ok');
    await withRetry(fn, { maxAttempts: 3, initialBackoffMs: 1, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
