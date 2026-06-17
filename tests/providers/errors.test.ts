/**
 * Tests for the provider error class.
 */

import { describe, expect, it } from 'vitest';
import { ProviderError } from '../../src/providers/errors.js';

describe('ProviderError', () => {
  it('is an Error with a name and code', () => {
    const e = new ProviderError('claude', 'RATE_LIMITED', 'Too many requests');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ProviderError');
    expect(e.code).toBe('RATE_LIMITED');
  });

  it('includes the provider name', () => {
    const e = new ProviderError('openai', 'TIMEOUT', 'Request timed out');
    expect(e.provider).toBe('openai');
  });

  it('preserves the cause', () => {
    const cause = new Error('network');
    const e = new ProviderError('claude', 'NETWORK_ERROR', 'Lost connection', { cause });
    expect(e.cause).toBe(cause);
  });

  it('preserves the status code', () => {
    const e = new ProviderError('claude', 'NETWORK_ERROR', 'Server error', { statusCode: 503 });
    expect(e.statusCode).toBe(503);
  });

  it('isRetryable returns true for RATE_LIMITED', () => {
    expect(new ProviderError('claude', 'RATE_LIMITED', '').isRetryable()).toBe(true);
  });

  it('isRetryable returns true for TIMEOUT', () => {
    expect(new ProviderError('claude', 'TIMEOUT', '').isRetryable()).toBe(true);
  });

  it('isRetryable returns true for NETWORK_ERROR', () => {
    expect(new ProviderError('claude', 'NETWORK_ERROR', '').isRetryable()).toBe(true);
  });

  it('isRetryable returns true for 5xx', () => {
    expect(new ProviderError('claude', 'UNKNOWN', '', { statusCode: 503 }).isRetryable()).toBe(true);
  });

  it('isRetryable returns false for 4xx', () => {
    expect(new ProviderError('claude', 'UNKNOWN', '', { statusCode: 400 }).isRetryable()).toBe(false);
  });

  it('isRetryable returns false for context length', () => {
    expect(new ProviderError('claude', 'CONTEXT_LENGTH_EXCEEDED', '').isRetryable()).toBe(false);
  });
});
