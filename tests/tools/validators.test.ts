/**
 * Tests for the validation framework.
 */

import { describe, expect, it } from 'vitest';
import {
  httpsOnly,
  maxLength,
  noShellMetacharacters,
  nonEmptyString,
  oneOf,
  pathSafe,
  positiveInt,
  validate,
} from '../../src/tools/validators.js';

const ctx = {
  toolName: 'test',
  agentName: 'test',
  runId: 'r1',
  repo: { owner: 'me', name: 'r' },
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
};

describe('validate', () => {
  it('returns the first failure', () => {
    const set = {
      rules: [
        () => 'first error',
        () => 'second error',
      ],
    };
    expect(validate('any', set, ctx)).toBe('first error');
  });

  it('returns null when all rules pass', () => {
    const set = { rules: [() => null, () => null] };
    expect(validate('any', set, ctx)).toBeNull();
  });
});

describe('nonEmptyString', () => {
  it('accepts a non-empty string', () => {
    expect(nonEmptyString('hello', ctx)).toBeNull();
  });
  it('rejects an empty string', () => {
    expect(nonEmptyString('', ctx)).toMatch(/non-empty/);
  });
  it('rejects a non-string', () => {
    expect(nonEmptyString(123 as unknown, ctx)).toMatch(/non-empty/);
  });
});

describe('positiveInt', () => {
  it('accepts a positive integer', () => {
    expect(positiveInt(42, ctx)).toBeNull();
  });
  it('rejects zero', () => {
    expect(positiveInt(0, ctx)).toMatch(/positive/);
  });
  it('rejects negative', () => {
    expect(positiveInt(-1, ctx)).toMatch(/positive/);
  });
  it('rejects a float', () => {
    expect(positiveInt(1.5, ctx)).toMatch(/positive/);
  });
});

describe('maxLength', () => {
  it('accepts a string within the limit', () => {
    expect(maxLength(10)('hello', ctx)).toBeNull();
  });
  it('rejects a string over the limit', () => {
    expect(maxLength(3)('hello', ctx)).toMatch(/at most 3/);
  });
});

describe('oneOf', () => {
  it('accepts a value in the list', () => {
    expect(oneOf(['a', 'b', 'c'])('b', ctx)).toBeNull();
  });
  it('rejects a value not in the list', () => {
    expect(oneOf(['a', 'b', 'c'])('d', ctx)).toMatch(/one of/);
  });
});

describe('noShellMetacharacters', () => {
  it('accepts a clean string', () => {
    expect(noShellMetacharacters('hello', ctx)).toBeNull();
  });
  it('rejects a string with shell metacharacters', () => {
    expect(noShellMetacharacters('hello; rm -rf /', ctx)).toMatch(/metacharacter/);
  });
});

describe('httpsOnly', () => {
  it('accepts an https URL', () => {
    expect(httpsOnly('https://example.com', ctx)).toBeNull();
  });
  it('rejects an http URL', () => {
    expect(httpsOnly('http://example.com', ctx)).toMatch(/https/);
  });
  it('rejects an invalid URL', () => {
    expect(httpsOnly('not a url', ctx)).toMatch(/not a valid URL/);
  });
});

describe('pathSafe', () => {
  it('accepts a safe relative path', () => {
    expect(pathSafe('/repo')('src/foo.ts', ctx)).toBeNull();
  });
  it('rejects a path with ..', () => {
    expect(pathSafe('/repo')('../etc/passwd', ctx)).toMatch(/cannot contain/);
  });
});
