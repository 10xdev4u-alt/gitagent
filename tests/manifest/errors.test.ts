/**
 * Tests for the manifest error types.
 */

import { describe, expect, it } from 'vitest';
import { ManifestError, ManifestValidationError } from '../../src/manifest/errors.js';

describe('ManifestError', () => {
  it('is an Error with a code', () => {
    const e = new ManifestError('FILE_NOT_FOUND', 'not here', { path: '/x' });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ManifestError');
    expect(e.code).toBe('FILE_NOT_FOUND');
  });

  it('includes the path in the message', () => {
    const e = new ManifestError('FILE_NOT_FOUND', 'not here', { path: '/x.md' });
    expect(e.path).toBe('/x.md');
  });

  it('preserves the cause', () => {
    const cause = new Error('boom');
    const e = new ManifestError('FILE_NOT_FOUND', 'oops', { cause });
    expect(e.cause).toBe(cause);
  });

  it('toString includes the code and path', () => {
    const e = new ManifestError('FILE_NOT_FOUND', 'not here', { path: '/x.md' });
    const s = e.toString();
    expect(s).toContain('FILE_NOT_FOUND');
    expect(s).toContain('/x.md');
  });
});

describe('ManifestValidationError', () => {
  it('is a ManifestError', () => {
    const e = new ManifestValidationError('/x.md', [{ path: 'name', message: 'required' }]);
    expect(e).toBeInstanceOf(ManifestError);
  });

  it('includes issues', () => {
    const e = new ManifestValidationError('/x.md', [
      { path: 'name', message: 'required' },
      { path: 'triggers', message: 'min 1' },
    ]);
    expect(e.issues).toHaveLength(2);
  });

  it('formats issue count in the message', () => {
    const e = new ManifestValidationError('/x.md', [{ path: 'name', message: 'required' }]);
    expect(e.message).toContain('1 issue');
  });

  it('uses plural form for multiple issues', () => {
    const e = new ManifestValidationError('/x.md', [
      { path: 'name', message: 'required' },
      { path: 'triggers', message: 'min 1' },
    ]);
    expect(e.message).toContain('2 issues');
  });
});
