/**
 * Custom error types for the providers module.
 */

export type ProviderErrorCode =
  | 'SDK_MISSING'
  | 'INVALID_API_KEY'
  | 'INVALID_MODEL'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'CONTEXT_LENGTH_EXCEEDED'
  | 'CONTENT_FILTERED'
  | 'UNKNOWN';

export class ProviderError extends Error {
  public readonly code: ProviderErrorCode;
  public readonly provider: string;
  public readonly statusCode: number | undefined;
  public readonly cause: unknown | undefined;

  constructor(
    provider: string,
    code: ProviderErrorCode,
    message: string,
    options: { statusCode?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
    this.statusCode = options.statusCode;
    this.cause = options.cause;
  }

  /** True if the error is retryable. */
  isRetryable(): boolean {
    return (
      this.code === 'RATE_LIMITED' ||
      this.code === 'NETWORK_ERROR' ||
      this.code === 'TIMEOUT' ||
      (this.statusCode !== undefined && this.statusCode >= 500)
    );
  }
}
