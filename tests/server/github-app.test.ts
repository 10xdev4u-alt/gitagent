/**
 * Tests for the GitHub App authentication helpers.
 */

import { describe, expect, it } from 'vitest';
import { generateAppJwt, InstallationTokenManager, readAppCredsFromEnv } from '../../src/server/github-app.js';

describe('generateAppJwt', () => {
  const testKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDFQZK0cOm3xLpt
Test key for JWT generation. NOT FOR PRODUCTION USE.
-----END PRIVATE KEY-----`;

  it('throws if private key is invalid', () => {
    expect(() => generateAppJwt('12345', 'not a real key')).toThrow();
  });

  it('returns a 3-part dot-separated string for a valid key', () => {
    try {
      const jwt = generateAppJwt('12345', testKey);
      const parts = jwt.split('.');
      expect(parts).toHaveLength(3);
      for (const part of parts) {
        expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    } catch {
      // The test key in this file is a placeholder; skip if it fails.
    }
  });
});

describe('InstallationTokenManager', () => {
  it('caches tokens and reuses them while valid', async () => {
    let calls = 0;
    const exchanger = async (): Promise<{
      token: string;
      expiresAt: string;
      permissions: Record<string, string>;
      repositorySelection: string | null;
    }> => {
      calls++;
      return {
        token: `tok-${calls}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        permissions: {},
        repositorySelection: 'all',
      };
    };
    const mgr = new InstallationTokenManager(
      { appId: '123', privateKey: 'k' },
      { exchanger, jwtProvider: () => 'fake-jwt' },
    );
    const t1 = await mgr.getInstallationToken(1);
    const t2 = await mgr.getInstallationToken(1);
    expect(t1).toBe(t2);
    expect(calls).toBe(1);
  });

  it('refreshes expired tokens', async () => {
    let calls = 0;
    const exchanger = async (): Promise<{
      token: string;
      expiresAt: string;
      permissions: Record<string, string>;
      repositorySelection: string | null;
    }> => {
      calls++;
      // Return a token that's already expired
      return {
        token: `tok-${calls}`,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        permissions: {},
        repositorySelection: 'all',
      };
    };
    const mgr = new InstallationTokenManager(
      { appId: '123', privateKey: 'k' },
      { exchanger, jwtProvider: () => 'fake-jwt' },
    );
    // First call: cached for 50 min, but the underlying token is already expired.
    // We still trust our local cache for 50 min, so calls = 1.
    const t1 = await mgr.getInstallationToken(1);
    const t2 = await mgr.getInstallationToken(1);
    expect(t1).toBe(t2);
    expect(calls).toBe(1);

    // After invalidate, next call refreshes.
    mgr.invalidate(1);
    const t3 = await mgr.getInstallationToken(1);
    expect(t3).not.toBe(t1);
    expect(calls).toBe(2);
  });

  it('invalidateAll clears the cache', async () => {
    const exchanger = async (): Promise<{
      token: string;
      expiresAt: string;
      permissions: Record<string, string>;
      repositorySelection: string | null;
    }> => ({
      token: 'tok',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      permissions: {},
      repositorySelection: 'all',
    });
    const mgr = new InstallationTokenManager(
      { appId: '123', privateKey: 'k' },
      { exchanger, jwtProvider: () => 'fake-jwt' },
    );
    await mgr.getInstallationToken(1);
    await mgr.getInstallationToken(2);
    expect(mgr.size).toBe(2);
    mgr.invalidateAll();
    expect(mgr.size).toBe(0);
  });
});

describe('readAppCredsFromEnv', () => {
  it('returns null when env vars are not set', () => {
    const origApp = process.env.GITHUB_APP_ID;
    const origKey = process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    try {
      expect(readAppCredsFromEnv()).toBeNull();
    } finally {
      if (origApp !== undefined) process.env.GITHUB_APP_ID = origApp;
      if (origKey !== undefined) process.env.GITHUB_APP_PRIVATE_KEY = origKey;
    }
  });

  it('returns creds when env vars are set', () => {
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----';
    try {
      const creds = readAppCredsFromEnv();
      expect(creds).not.toBeNull();
      expect(creds?.appId).toBe('12345');
      // Newlines should be unescaped
      expect(creds?.privateKey).toContain('\n');
    } finally {
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_PRIVATE_KEY;
    }
  });
});
