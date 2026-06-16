/**
 * Retry logic with exponential backoff.
 *
 * Used by the agent runner to retry transient errors (rate limits,
 * network errors, 5xx responses). The retry policy is configurable.
 */

import { ProviderError } from '../providers/errors.js';

export interface RetryPolicy {
  /** Max number of attempts (default 3). */
  maxAttempts: number;
  /** Initial backoff in ms (default 500). */
  initialBackoffMs: number;
  /** Max backoff in ms (default 30_000). */
  maxBackoffMs: number;
  /** Backoff multiplier (default 2). */
  backoffMultiplier: number;
  /** Jitter factor 0-1 (default 0.1). */
  jitterFactor: number;
}

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  initialBackoffMs: 500,
  maxBackoffMs: 30_000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

export function isRetryableError(err: unknown): boolean {
  if (err instanceof ProviderError) return err.isRetryable();
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('rate limit') || msg.includes('timeout') || msg.includes('econnreset') || msg.includes('enotfound');
  }
  return false;
}

export function computeBackoff(attempt: number, policy: RetryPolicy): number {
  const exp = policy.initialBackoffMs * policy.backoffMultiplier ** (attempt - 1);
  const capped = Math.min(exp, policy.maxBackoffMs);
  const jitter = capped * policy.jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, capped + jitter);
}

export interface RetryOptions extends Partial<RetryPolicy> {
  /** Abort signal. */
  signal?: AbortSignal;
  /** Called before each retry with the attempt number and backoff. */
  onRetry?: (attempt: number, backoffMs: number, err: unknown) => void;
}

/**
 * Retry an async function with exponential backoff.
 * Only retries if {@link isRetryableError} returns true for the thrown error.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const policy: RetryPolicy = { ...defaultRetryPolicy, ...options };
  let lastErr: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    if (options.signal?.aborted) throw new Error('Aborted');
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === policy.maxAttempts) break;
      if (!isRetryableError(err)) break;
      const backoffMs = computeBackoff(attempt, policy);
      options.onRetry?.(attempt, backoffMs, err);
      await sleep(backoffMs, options.signal);
    }
  }
  throw lastErr;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    });
  });
}
