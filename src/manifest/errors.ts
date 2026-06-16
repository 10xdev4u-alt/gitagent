/**
 * Custom error types for the manifest module.
 *
 * Every error in the manifest layer is a {@link ManifestError} so callers can
 * `instanceof`-check and surface a clean message to the user.
 */

export type ManifestErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_READ_ERROR'
  | 'INVALID_FRONTMATTER'
  | 'INVALID_BODY'
  | 'INVALID_NAME'
  | 'INVALID_TRIGGER'
  | 'INVALID_TOOL'
  | 'INVALID_MODEL'
  | 'INVALID_PERMISSIONS'
  | 'INVALID_MEMORY'
  | 'VALIDATION_FAILED'
  | 'MULTIPLE_MANIFESTS_FOR_EVENT'
  | 'NO_TRIGGERS';

export class ManifestError extends Error {
  public readonly code: ManifestErrorCode;
  public readonly path: string | undefined;
  public readonly cause: unknown | undefined;

  constructor(
    code: ManifestErrorCode,
    message: string,
    options: { path?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'ManifestError';
    this.code = code;
    this.path = options.path;
    this.cause = options.cause;
  }

  /** Pretty-print for CLI output. */
  override toString(): string {
    const where = this.path ? ` (in ${this.path})` : '';
    return `${this.name}[${this.code}]${where}: ${this.message}`;
  }
}

export class ManifestValidationError extends ManifestError {
  public readonly issues: Array<{ path: string; message: string }>;

  constructor(
    path: string,
    issues: Array<{ path: string; message: string }>,
  ) {
    super(
      'VALIDATION_FAILED',
      `Manifest validation failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}`,
      { path },
    );
    this.name = 'ManifestValidationError';
    this.issues = issues;
  }
}
