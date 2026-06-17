/**
 * Tests for the GitHub webhook signature verification.
 */

import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from '../../src/server/webhook-signature.js';

describe('verifyWebhookSignature', () => {
  const secret = 'super-secret-token';
  const body = '{"action":"opened","issue":{"number":42}}';

  it('verifies a valid signature', () => {
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyWebhookSignature(body, 'sha256=invalid', secret)).toBe(false);
  });

  it('rejects when secret differs', () => {
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifyWebhookSignature(body, sig, 'wrong-secret')).toBe(false);
  });

  it('rejects when body differs', () => {
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifyWebhookSignature('{"different":true}', sig, secret)).toBe(false);
  });

  it('handles sha1 prefix', () => {
    const sig = `sha1=${createHmac('sha1', secret).update(body).digest('hex')}`;
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('rejects when signature is empty', () => {
    expect(verifyWebhookSignature(body, '', secret)).toBe(false);
  });

  it('rejects when secret is empty', () => {
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifyWebhookSignature(body, sig, '')).toBe(false);
  });

  it('rejects when signature has no prefix', () => {
    const hex = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookSignature(body, hex, secret)).toBe(false);
  });
});
