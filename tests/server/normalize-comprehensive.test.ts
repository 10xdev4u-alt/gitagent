/**
 * Tests for the GitHub event normalizer.
 */

import { describe, expect, it } from 'vitest';
import { normalizeWebhook } from '../../src/server/normalize.js';

describe('normalizeWebhook', () => {
  it('normalizes an issues.opened event', () => {
    const result = normalizeWebhook('issues', { action: 'opened' }, 'd-1');
    expect(result.name).toBe('issues.opened');
    expect(result.action).toBe('opened');
  });

  it('normalizes an issues.closed event', () => {
    const result = normalizeWebhook('issues', { action: 'closed' }, 'd-1');
    expect(result.name).toBe('issues.closed');
  });

  it('normalizes an issues.labeled event', () => {
    const result = normalizeWebhook('issues', { action: 'labeled' }, 'd-1');
    expect(result.name).toBe('issues.labeled');
  });

  it('normalizes a pull_request.opened event', () => {
    const result = normalizeWebhook('pull_request', { action: 'opened' }, 'd-1');
    expect(result.name).toBe('pull_request.opened');
  });

  it('normalizes an issue_comment.created event', () => {
    const result = normalizeWebhook('issue_comment', { action: 'created' }, 'd-1');
    expect(result.name).toBe('issue_comment.created');
  });

  it('normalizes a workflow_run.completed event', () => {
    const result = normalizeWebhook('workflow_run', { action: 'completed' }, 'd-1');
    expect(result.name).toBe('workflow_run.completed');
  });

  it('passes through push event unchanged', () => {
    const result = normalizeWebhook('push', { ref: 'refs/heads/main' }, 'd-1');
    expect(result.name).toBe('push');
    expect(result.action).toBeUndefined();
  });

  it('preserves the original payload', () => {
    const payload = { action: 'opened', issue: { number: 42 } };
    const result = normalizeWebhook('issues', payload, 'd-1');
    expect(result.payload).toEqual(payload);
  });

  it('includes the deliveryId', () => {
    const result = normalizeWebhook('issues', { action: 'opened' }, 'd-abc-123');
    expect(result.deliveryId).toBe('d-abc-123');
  });

  it('includes the installationId when provided', () => {
    const result = normalizeWebhook('issues', { action: 'opened' }, 'd-1', 42);
    expect(result.installationId).toBe(42);
  });

  it('omits installationId when not provided', () => {
    const result = normalizeWebhook('issues', { action: 'opened' }, 'd-1');
    expect(result.installationId).toBeUndefined();
  });
});
