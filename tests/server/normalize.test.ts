/**
 * Tests for the webhook event normalization.
 */

import { describe, expect, it } from 'vitest';
import { normalizeWebhook } from '../../src/server/normalize.js';

describe('normalizeWebhook', () => {
  it('normalizes issues.opened', () => {
    const n = normalizeWebhook('issues', { action: 'opened', issue: { number: 1 } }, 'd1', 123);
    expect(n.name).toBe('issues.opened');
    expect(n.action).toBe('opened');
    expect(n.deliveryId).toBe('d1');
    expect(n.installationId).toBe(123);
  });

  it('normalizes pull_request.closed', () => {
    const n = normalizeWebhook('pull_request', { action: 'closed' }, 'd2');
    expect(n.name).toBe('pull_request.closed');
    expect(n.action).toBe('closed');
  });

  it('passes through unknown events unchanged', () => {
    const n = normalizeWebhook('ping', {}, 'd3');
    expect(n.name).toBe('ping');
  });

  it('handles missing action', () => {
    const n = normalizeWebhook('issues', { issue: {} }, 'd4');
    expect(n.name).toBe('issues');
    expect(n.action).toBeUndefined();
  });
});
