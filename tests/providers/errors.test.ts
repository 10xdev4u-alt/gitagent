/**
 * Tests for the provider error class and retry detection.
 */

import { describe, expect, it } from 'vitest';
import { ProviderError, isRetryableProviderError } from '../../src/providers/errors.js';

describe('ProviderError', () => {
  it('is an Error with a name and code', () => {
    const e = new ProviderError('claude', 'RATE_LIMIT', 'Too many requests');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ProviderError');
    expect(e.code).toBe('RATE_LIMIT');
    expect(e.message).toBe('claude: RATE_LIMIT: Too many requests');
  });

  it('includes the provider name', () => {
    const e = new ProviderError('openai', 'TIMEOUT', 'Request timed out');
    expect(e.provider).toBe('openai');
  });

  it('preserves the cause', () => {
    const cause = new Error('network');
    const e = new ProviderError('claude', 'NETWORK', 'Lost connection', { cause });
    expect(e.cause).toBe(cause);
  });
});

describe('isRetryableProviderError', () => {
  it('returns true for rate limit errors', () => {
    expect(isRetryableProviderError(new ProviderError('claude', 'RATE_LIMIT', ''))).toBe(true);
  });

  it('returns true for timeout errors', () => {
    expect(isRetryableProviderError(new ProviderError('claude', 'TIMEOUT', ''))).toBe(true);
  });

  it('returns true for network errors', () => {
    expect(isRetryableProviderError(new ProviderError('claude', 'NETWORK', ''))).toBe(true);
  });

  it('returns false for invalid input errors', () => {
    expect(isRetryableProviderError(new ProviderError('claude', 'INVALID_INPUT', ''))).toBe(false);
  });

  it('returns false for auth errors', () => {
    expect(isRetryableProviderError(new ProviderError('claude', 'AUTH', ''))).toBe(false);
  });

  it('returns false for non-ProviderError', () => {
    expect(isRetryableProviderError(new Error('boom'))).toBe(false);
  });
});
