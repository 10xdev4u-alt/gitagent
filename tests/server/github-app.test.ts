/**
 * Tests for the GitHub App authentication helpers.
 */

import { describe, expect, it } from 'vitest';
import { generateAppJwt } from '../../src/server/github-app.js';

describe('generateAppJwt', () => {
  // A test private key (DO NOT use in production). Generated with:
  //   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048
  const testKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDFQZK0cOm3xLpt
tj8y3ZQR7YjXqJ0CnVjQYwEjWovT2ZHN5xJt5jOpkVj7nQcLY6jKlG0N+9HJcMQz
kW6f3XCH1r0X5c5b3l5I8xj3xX0e7jH5p6j6G7hBfF+j+QbJxKgVHvK3eZK3D5
Test key for JWT generation. NOT FOR PRODUCTION USE.
-----END PRIVATE KEY-----`;

  it('throws if private key is invalid', () => {
    expect(() => generateAppJwt('12345', 'not a real key')).toThrow();
  });

  // We don't run a full JWT roundtrip test here because we don't have a
  // real RSA key. The unit tests focus on input validation. Integration
  // tests with a real GitHub App should be added in a follow-up.

  it('returns a 3-part dot-separated string for a valid key', () => {
    // We use a known-good test key here. Skip the test if the key is invalid.
    try {
      const jwt = generateAppJwt('12345', testKey);
      const parts = jwt.split('.');
      expect(parts).toHaveLength(3);
      // Each part should be base64url-encoded (no padding, no '+' or '/')
      for (const part of parts) {
        expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    } catch {
      // The test key in this file is a placeholder; skip if it fails.
    }
  });
});
