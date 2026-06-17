/**
 * Validation framework for tool inputs.
 *
 * Apply a set of named validators to a tool's input. The framework
 * runs each validator, short-circuits on the first failure, and
 * returns an error message that's safe to send back to the LLM.
 */

export interface ValidationContext {
  /** The tool's name. */
  toolName: string;
  /** The agent's name. */
  agentName: string;
  /** The run id. */
  runId: string;
  /** The repo context. */
  repo: { owner: string; name: string };
  /** Logger. */
  logger: {
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

export type ValidationRule<T = unknown> = (input: T, ctx: ValidationContext) => string | null;

export interface ValidationRuleSet<T = unknown> {
  rules: ValidationRule<T>[];
  /** If true, all rules must pass (default: any failure short-circuits). */
  allRequired?: boolean;
}

/** Run the rules. Returns the first failure, or null if all pass. */
export function validate<T>(input: T, set: ValidationRuleSet<T>, ctx: ValidationContext): string | null {
  for (const rule of set.rules) {
    const error = rule(input, ctx);
    if (error) return error;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Built-in validators                                                 */
/* ------------------------------------------------------------------ */

/** Ensure the input is a non-empty string. */
export const nonEmptyString: ValidationRule<string> = (input) => {
  if (typeof input !== 'string' || input.length === 0) {
    return 'Input must be a non-empty string';
  }
  return null;
};

/** Ensure the input is a positive integer. */
export const positiveInt: ValidationRule<number> = (input) => {
  if (typeof input !== 'number' || !Number.isInteger(input) || input <= 0) {
    return 'Input must be a positive integer';
  }
  return null;
};

/** Ensure the string is within a max length. */
export function maxLength(n: number): ValidationRule<string> {
  return (input) => {
    if (typeof input !== 'string') return 'Input must be a string';
    if (input.length > n) return `Input must be at most ${n} characters (got ${input.length})`;
    return null;
  };
}

/** Ensure the value is in an allow-list. */
export function oneOf<T>(allowed: T[]): ValidationRule<T> {
  return (input) => {
    if (!allowed.includes(input)) {
      return `Input must be one of: ${allowed.join(', ')}`;
    }
    return null;
  };
}

/** Ensure a file path doesn't escape a base directory. */
export function pathSafe(baseDir: string): ValidationRule<string> {
  return (input, ctx) => {
    if (typeof input !== 'string') return 'Input must be a string path';
    if (input.includes('..')) return 'Path cannot contain ..';
    if (path.isAbsolute(input) && !input.startsWith(baseDir)) {
      ctx.logger.warn('pathSafe: absolute path outside base', { path: input, base: baseDir });
      return 'Absolute path must be within the repo';
    }
    return null;
  };
}

import path from 'node:path';

/** Ensure a string doesn't contain shell metacharacters. */
export const noShellMetacharacters: ValidationRule<string> = (input) => {
  if (typeof input !== 'string') return 'Input must be a string';
  if (/[;&|`$<>(){}\[\]\\]/.test(input)) {
    return 'Input contains shell metacharacters';
  }
  return null;
};

/** Ensure a URL is HTTPS. */
export const httpsOnly: ValidationRule<string> = (input) => {
  if (typeof input !== 'string') return 'Input must be a string URL';
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:') return 'URL must use https://';
  } catch {
    return 'Input is not a valid URL';
  }
  return null;
};
