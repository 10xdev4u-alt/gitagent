/**
 * Tests for the ToolError class.
 */

import { describe, expect, it } from 'vitest';
import { ToolError } from '../../src/tools/errors.js';

describe('ToolError', () => {
  it('is an Error with a name and code', () => {
    const e = new ToolError('echo', 'INVALID_INPUT', 'bad input');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ToolError');
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.toolName).toBe('echo');
  });

  it('includes the message', () => {
    const e = new ToolError('echo', 'INVALID_INPUT', 'bad input');
    expect(e.message).toContain('bad input');
  });

  it('preserves the cause', () => {
    const cause = new Error('boom');
    const e = new ToolError('echo', 'EXECUTION_FAILED', 'failed', { cause });
    expect(e.cause).toBe(cause);
  });
});
