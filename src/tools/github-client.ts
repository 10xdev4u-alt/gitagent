/**
 * Lazy-loaded GitHub client wrapper.
 *
 * Wraps Octokit so the heavy SDK is only imported on first use. The
 * agent runtime hands out clients per-run; tokens can be installation
 * tokens (for GitHub App installations) or PATs (for development).
 */

import type { Octokit } from '@octokit/rest';

export interface GitHubClientOptions {
  /** Auth token (installation token, PAT, etc.). */
  token: string;
  /** Optional base URL for GitHub Enterprise. */
  baseUrl?: string;
  /** Logger. */
  logger?: {
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

let cachedSdk: typeof import('@octokit/rest').Octokit | null = null;

async function loadOctokit(): Promise<typeof import('@octokit/rest').Octokit> {
  if (cachedSdk) return cachedSdk;
  const mod = await import('@octokit/rest');
  cachedSdk = mod.Octokit;
  return cachedSdk;
}

/**
 * Create an Octokit client. The first call dynamically imports the SDK;
 * subsequent calls reuse the cached constructor.
 */
export async function createGitHubClient(options: GitHubClientOptions): Promise<Octokit> {
  const OctokitCtor = await loadOctokit();
  return new OctokitCtor({
    auth: options.token,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    userAgent: 'gitagent/0.1.0',
    log: options.logger
      ? {
          debug: ((msg: string, info?: unknown) => {
            options.logger?.debug(msg, info as Record<string, unknown>);
          }) as never,
          info: ((msg: string, info?: unknown) => {
            options.logger?.info(msg, info as Record<string, unknown>);
          }) as never,
          warn: ((msg: string, info?: unknown) => {
            options.logger?.warn(msg, info as Record<string, unknown>);
          }) as never,
          error: ((msg: string, info?: unknown) => {
            options.logger?.error(msg, info as Record<string, unknown>);
          }) as never,
        }
      : undefined,
  });
}
