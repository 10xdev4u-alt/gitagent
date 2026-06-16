/**
 * Webhook signature verification.
 *
 * Verifies that incoming webhook requests are actually from GitHub.
 * GitHub signs the body with a secret using HMAC-SHA256 and sends the
 * signature in the `X-Hub-Signature-256` header.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  // signature looks like "sha256=..."
  const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
  } catch {
    return false;
  }
}

/** Compute the signature for a payload (used in tests + local dev). */
export function signWebhookPayload(payload: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
}
