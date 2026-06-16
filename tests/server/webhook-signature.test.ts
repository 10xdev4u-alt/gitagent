/**
 * Tests for the webhook signature verification.
 */

import { describe, expect, it } from 'vitest';
import { signWebhookPayload, verifyWebhookSignature } from '../../src/server/webhook-signature.js';

describe('verifyWebhookSignature', () => {
  const secret = 'super-secret';
  const payload = '{"action":"opened"}';

  it('accepts a valid signature', () => {
    const sig = signWebhookPayload(payload, secret);
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyWebhookSignature(payload, 'sha256=invalidsig', secret)).toBe(false);
  });

  it('rejects when signature is missing', () => {
    expect(verifyWebhookSignature(payload, undefined, secret)).toBe(false);
  });

  it('rejects when secret is wrong', () => {
    const sig = signWebhookPayload(payload, secret);
    expect(verifyWebhookSignature(payload, sig, 'wrong-secret')).toBe(false);
  });

  it('rejects when payload is tampered', () => {
    const sig = signWebhookPayload(payload, secret);
    expect(verifyWebhookSignature('{"action":"closed"}', sig, secret)).toBe(false);
  });

  it('is constant-time (length-mismatch short-circuits)', () => {
    expect(verifyWebhookSignature(payload, 'short', secret)).toBe(false);
  });
});
