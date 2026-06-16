/**
 * Tests for the retry logic.
 */

import { describe, expect, it, vi } from 'vitest';
import { computeBackoff, isRetryableError, withRetry } from '../../src/runtime/retry.js';
import { ProviderError } from '../../src/providers/errors.js';

describe('isRetryableError', () => {
  it('returns true for ProviderError with retryable code', () => {
    const e = new ProviderError('openai', 'RATE_LIMITED', 'rate limit');
    expect(isRetryableError(e)).toBe(true);
  });

  it('returns false for ProviderError with non-retryable code', () => {
    const e = new ProviderError('openai', 'INVALID_API_KEY', 'bad key');
    expect(isRetryableError(e)).toBe(false);
  });

  it('returns true for plain Error with rate limit message', () => {
    expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
  });

  it('returns true for plain Error with timeout message', () => {
    expect(isRetryableError(new Error('Request timeout'))).toBe(true);
  });

  it('returns false for unknown error', () => {
    expect(isRetryableError(new Error('Something else'))).toBe(false);
  });
});

describe('computeBackoff', () => {
  it('grows exponentially with attempts', () => {
    const policy = { maxAttempts: 5, initialBackoffMs: 100, maxBackoffMs: 100_000, backoffMultiplier: 2, jitterFactor: 0 };
    const b1 = computeBackoff(1, policy);
    const b2 = computeBackoff(2, policy);
    const b3 = computeBackoff(3, policy);
    expect(b1).toBe(100);
    expect(b2).toBe(200);
    expect(b3).toBe(400);
  });

  it('caps at maxBackoffMs', () => {
    const policy = { maxAttempts: 100, initialBackoffMs: 1000, maxBackoffMs: 5000, backoffMultiplier: 2, jitterFactor: 0 };
    expect(computeBackoff(20, policy)).toBe(5000);
  });
});

describe('withRetry', () => {
  it('returns the value on first success', async () => {
    const fn = vi.fn(async () => 'ok');
    const r = await withRetry(fn);
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable errors and eventually succeeds', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new ProviderError('openai', 'RATE_LIMITED', 'rl');
      return 'ok';
    };
    const r = await withRetry(fn, { initialBackoffMs: 1, maxBackoffMs: 10, backoffMultiplier: 2, jitterFactor: 0, maxAttempts: 5 });
    expect(r).toBe('ok');
    expect(calls).toBe(3);
  });

  it('does not retry on non-retryable errors', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new ProviderError('openai', 'INVALID_API_KEY', 'bad');
    };
    await expect(withRetry(fn, { maxAttempts: 5, initialBackoffMs: 1, maxBackoffMs: 10, backoffMultiplier: 2, jitterFactor: 0 })).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('throws after maxAttempts on persistent failures', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new ProviderError('openai', 'RATE_LIMITED', 'rl');
    };
    await expect(withRetry(fn, { maxAttempts: 2, initialBackoffMs: 1, maxBackoffMs: 10, backoffMultiplier: 2, jitterFactor: 0 })).rejects.toThrow();
    expect(calls).toBe(2);
  });

  it('fires onRetry callback', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new ProviderError('openai', 'RATE_LIMITED', 'rl');
    };
    const onRetry = vi.fn();
    await expect(withRetry(fn, { maxAttempts: 2, initialBackoffMs: 1, maxBackoffMs: 10, backoffMultiplier: 2, jitterFactor: 0, onRetry })).rejects.toThrow();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Number), expect.any(ProviderError));
  });

  it('aborts when signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = async () => 'ok';
    await expect(withRetry(fn, { signal: controller.signal })).rejects.toThrow('Aborted');
  });
});
