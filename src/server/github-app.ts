/**
 * GitHub App authentication.
 *
 * Generates a JWT for the app, exchanges it for an installation token,
 * and caches the token until it expires.
 */

import { createSign } from 'node:crypto';

let cachedApp: typeof import('@octokit/auth-app').App | null = null;

async function loadAuthApp(): Promise<typeof import('@octokit/auth-app').App> {
  if (cachedApp) return cachedApp;
  const mod = await import('@octokit/auth-app');
  cachedApp = mod.App;
  return cachedApp;
}

export interface GitHubAppCredentials {
  /** App ID. */
  appId: string | number;
  /** Private key (PEM). */
  privateKey: string;
  /** Client ID (optional). */
  clientId?: string;
  /** Client secret (optional). */
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

/** A cached installation token. */
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

/**
 * Token manager that exchanges an app's JWT for installation tokens
 * and caches them until they expire.
 */
export class InstallationTokenManager {
  private readonly cache: Map<string, TokenCacheEntry> = new Map();
  private readonly app: unknown;
  private readonly appId: string | number;

  constructor(creds: GitHubAppCredentials) {
    this.appId = creds.appId;
    // Note: we don't actually call loadAuthApp() here because it requires async
    // and the constructor is sync. The token method is async and lazy-loads.
    this.app = null;
  }

  /** Get the credentials, lazy-loading the SDK. */
  private async getApp(creds: GitHubAppCredentials): Promise<unknown> {
    if (this.app) return this.app;
    const AppCtor = await loadAuthApp();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = new (AppCtor as any)({
      appId: creds.appId,
      privateKey: creds.privateKey,
      ...(creds.clientId ? { clientId: creds.clientId } : {}),
      ...(creds.clientSecret ? { clientSecret: creds.clientSecret } : {}),
    });
    (this as { app: unknown }).app = app;
    return app;
  }

  /** Get an installation token, using the cache if possible. */
  async getInstallationToken(
    creds: GitHubAppCredentials,
    installationId: number,
  ): Promise<string> {
    const key = `${this.appId}:${installationId}`;
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now + 60_000) {
      return cached.token.token;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app: any = await this.getApp(creds);
    const result = await app.getInstallationAccessToken({ installationId });
    const token: InstallationToken = {
      token: result.data.token,
      expiresAt: result.data.expires_at,
      permissions: result.data.permissions ?? {},
      repositorySelection: result.data.repository_selection ?? null,
    };
    // GitHub tokens are valid for 1 hour; cache for 50 minutes to be safe.
    const expiresAt = now + 50 * 60 * 1000;
    this.cache.set(key, { token, expiresAt });
    return token.token;
  }

  /** Invalidate a cached token. */
  invalidate(installationId: number): void {
    const key = `${this.appId}:${installationId}`;
    this.cache.delete(key);
  }

  /** Invalidate all cached tokens. */
  invalidateAll(): void {
    this.cache.clear();
  }
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
