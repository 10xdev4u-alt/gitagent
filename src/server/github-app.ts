/**
 * GitHub App authentication.
 *
 * Generates a JWT for the app and exchanges it for installation tokens.
 * The token manager caches tokens until they expire.
 *
 * The JWT itself is signed with the app's private key and is sufficient
 * to call GitHub's REST API as the app (e.g. for listing installations).
 * To act on behalf of an installation, you need an installation token.
 */

import { createSign } from 'node:crypto';

export interface GitHubAppCredentials {
  /** App ID. */
  appId: string | number;
  /** Private key (PEM). */
  privateKey: string;
  /** Client ID (optional, for OAuth flows). */
  clientId?: string;
  /** Client secret (optional, for OAuth flows). */
  clientSecret?: string;
}

/** Generate a JWT signed with the app's private key. */
export function generateAppJwt(appId: string | number, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // 1 minute in the past to allow clock drift
    exp: now + 10 * 60, // 10 minutes in the future
    iss: String(appId),
  };
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signatureInput = `${headerB64}.${payloadB64}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signatureInput);
  const sig = signer.sign(privateKey);
  return `${signatureInput}.${base64urlFromBuffer(sig)}`;
}

function base64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function base64urlFromBuffer(buf: Buffer): string {
  return buf.toString('base64url');
}

/** A GitHub installation access token. */
export interface InstallationToken {
  token: string;
  expiresAt: string;
  permissions: Record<string, string>;
  repositorySelection: string | null;
}

interface TokenCacheEntry {
  token: InstallationToken;
  expiresAt: number;
}

/** A function that exchanges a JWT for an installation token. */
export type TokenExchanger = (jwt: string, installationId: number) => Promise<InstallationToken>;

/**
 * Token manager that exchanges an app's JWT for installation tokens
 * and caches them until they expire.
 */
export class InstallationTokenManager {
  private readonly cache: Map<string, TokenCacheEntry> = new Map();
  private readonly creds: GitHubAppCredentials;
  private readonly exchanger: TokenExchanger;

  constructor(creds: GitHubAppCredentials, exchanger?: TokenExchanger) {
    this.creds = creds;
    this.exchanger = exchanger ?? defaultTokenExchanger;
  }

  /** Get an installation token, using the cache if possible. */
  async getInstallationToken(installationId: number): Promise<string> {
    const key = `${this.creds.appId}:${installationId}`;
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now + 60_000) {
      return cached.token.token;
    }
    const jwt = generateAppJwt(this.creds.appId, this.creds.privateKey);
    const token = await this.exchanger(jwt, installationId);
    // GitHub tokens are valid for 1 hour; cache for 50 minutes to be safe.
    const expiresAt = now + 50 * 60 * 1000;
    this.cache.set(key, { token, expiresAt });
    return token.token;
  }

  /** Invalidate a cached token. */
  invalidate(installationId: number): void {
    const key = `${this.creds.appId}:${installationId}`;
    this.cache.delete(key);
  }

  /** Invalidate all cached tokens. */
  invalidateAll(): void {
    this.cache.clear();
  }

  /** Number of cached tokens. */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Default token exchanger that calls GitHub's REST API.
 *
 * POST /app/installations/{installation_id}/access_tokens
 * Authorization: Bearer {jwt}
 */
export async function defaultTokenExchanger(jwt: string, installationId: number): Promise<InstallationToken> {
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gitagent/0.1.0',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get installation token (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    token: string;
    expires_at: string;
    permissions?: Record<string, string>;
    repository_selection?: string | null;
  };
  return {
    token: data.token,
    expiresAt: data.expires_at,
    permissions: data.permissions ?? {},
    repositorySelection: data.repository_selection ?? null,
  };
}

/** Convenience: read app creds from environment. */
export function readAppCredsFromEnv(): GitHubAppCredentials | null {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) return null;
  return {
    appId,
    privateKey: privateKey.replace(/\\n/g, '\n'),
    ...(process.env.GITHUB_APP_CLIENT_ID ? { clientId: process.env.GITHUB_APP_CLIENT_ID } : {}),
    ...(process.env.GITHUB_APP_CLIENT_SECRET
      ? { clientSecret: process.env.GITHUB_APP_CLIENT_SECRET }
      : {}),
  };
}
