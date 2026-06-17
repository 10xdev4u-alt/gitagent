/**
 * Tests for the GitHub App installation token manager.
 */

import { describe, expect, it } from 'vitest';
import { InstallationTokenManager, readAppCredsFromEnv } from '../../src/server/github-app.js';

describe('InstallationTokenManager', () => {
  it('returns a token from the exchanger', async () => {
    const mgr = new InstallationTokenManager(
      { appId: '123', privateKey: 'k' },
      {
        exchanger: async () => ({
          token: 'tok-abc',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          permissions: {},
          repositorySelection: null,
        }),
        jwtProvider: () => 'fake-jwt',
      },
    );
    const token = await mgr.getInstallationToken(1);
    expect(token).toBe('tok-abc');
  });

  it('caches the token across calls', async () => {
    let calls = 0;
    const mgr = new InstallationTokenManager(
      { appId: '123', privateKey: 'k' },
      {
        exchanger: async () => {
          calls++;
          return {
            token: `tok-${calls}`,
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            permissions: {},
            repositorySelection: null,
          };
        },
        jwtProvider: () => 'fake-jwt',
      },
    );
    const t1 = await mgr.getInstallationToken(1);
    const t2 = await mgr.getInstallationToken(1);
    expect(t1).toBe(t2);
    expect(calls).toBe(1);
  });

  it('refreshes expired tokens', async () => {
    let calls = 0;
    const mgr = new InstallationTokenManager(
      { appId: '123', privateKey: 'k' },
      {
        exchanger: async () => {
          calls++;
          return {
            token: `tok-${calls}`,
            // Return a token that's already expired
            expiresAt: new Date(Date.now() - 1000).toISOString(),
            permissions: {},
            repositorySelection: null,
          };
        },
        jwtProvider: () => 'fake-jwt',
      },
    );
    const t1 = await mgr.getInstallationToken(1);
    mgr.invalidate(1);
    const t2 = await mgr.getInstallationToken(1);
    expect(t1).not.toBe(t2);
    expect(calls).toBe(2);
  });

  it('caches per-installation-id', async () => {
    let calls = 0;
    const mgr = new InstallationTokenManager(
      { appId: '123', privateKey: 'k' },
      {
        exchanger: async () => {
          calls++;
          return {
            token: `tok-${calls}`,
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            permissions: {},
            repositorySelection: null,
          };
        },
        jwtProvider: () => 'fake-jwt',
      },
    );
    await mgr.getInstallationToken(1);
    await mgr.getInstallationToken(2);
    await mgr.getInstallationToken(1);
    expect(calls).toBe(2);
  });

  it('invalidateAll clears all cached tokens', async () => {
    let calls = 0;
    const mgr = new InstallationTokenManager(
      { appId: '123', privateKey: 'k' },
      {
        exchanger: async () => {
          calls++;
          return {
            token: `tok-${calls}`,
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            permissions: {},
            repositorySelection: null,
          };
        },
        jwtProvider: () => 'fake-jwt',
      },
    );
    await mgr.getInstallationToken(1);
    await mgr.getInstallationToken(2);
    mgr.invalidateAll();
    expect(mgr.size).toBe(0);
  });
});

describe('readAppCredsFromEnv', () => {
  it('returns null when env vars are missing', () => {
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
      expect(creds?.privateKey).toContain('\n'); // Newlines unescaped
    } finally {
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_PRIVATE_KEY;
    }
  });
});
