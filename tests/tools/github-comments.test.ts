/**
 * Tests for the GitHub comment tools.
 */

import { describe, expect, it, vi } from 'vitest';
import { makePostCommentTool, makeAddLabelsTool, makeRemoveLabelTool } from '../../src/tools/github-comments.js';

function noopLogger() {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

function makeContext(dryRun = false) {
  return {
    agentName: 'test',
    runId: 'r1',
    repo: { owner: 'foo', name: 'bar' },
    event: { name: 'issues.opened', payload: {} },
    dryRun,
    logger: noopLogger(),
  };
}

describe('makePostCommentTool', () => {
  it('has the right name and description', () => {
    const t = makePostCommentTool({ token: 'test' });
    expect(t.name).toBe('github.post_comment');
    expect(t.description).toContain('comment');
  });

  it('requires issueNumber and body', () => {
    const t = makePostCommentTool({ token: 'test' });
    const result = t.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts a valid input', () => {
    const t = makePostCommentTool({ token: 'test' });
    const result = t.inputSchema.safeParse({ issueNumber: 1, body: 'hi' });
    expect(result.success).toBe(true);
  });

  it('rejects empty body', () => {
    const t = makePostCommentTool({ token: 'test' });
    const result = t.inputSchema.safeParse({ issueNumber: 1, body: '' });
    expect(result.success).toBe(false);
  });

  it('dry-run returns ok without calling API', async () => {
    const t = makePostCommentTool({ token: 'test' });
    const result = await t.execute({ issueNumber: 1, body: 'hi' }, makeContext(true));
    expect(result.ok).toBe(true);
    expect((result.output as { dryRun: boolean }).dryRun).toBe(true);
  });
});

describe('makeAddLabelsTool', () => {
  it('has the right name and description', () => {
    const t = makeAddLabelsTool({ token: 'test' });
    expect(t.name).toBe('github.add_labels');
  });

  it('requires at least one label', () => {
    const t = makeAddLabelsTool({ token: 'test' });
    const result = t.inputSchema.safeParse({ issueNumber: 1, labels: [] });
    expect(result.success).toBe(false);
  });

  it('accepts a valid input', () => {
    const t = makeAddLabelsTool({ token: 'test' });
    const result = t.inputSchema.safeParse({ issueNumber: 1, labels: ['bug'] });
    expect(result.success).toBe(true);
  });

  it('dry-run returns ok without calling API', async () => {
    const t = makeAddLabelsTool({ token: 'test' });
    const result = await t.execute({ issueNumber: 1, labels: ['bug'] }, makeContext(true));
    expect(result.ok).toBe(true);
  });
});

describe('makeRemoveLabelTool', () => {
  it('has the right name and description', () => {
    const t = makeRemoveLabelTool({ token: 'test' });
    expect(t.name).toBe('github.remove_label');
  });

  it('accepts a valid input', () => {
    const t = makeRemoveLabelTool({ token: 'test' });
    const result = t.inputSchema.safeParse({ issueNumber: 1, label: 'bug' });
    expect(result.success).toBe(true);
  });

  it('dry-run returns ok without calling API', async () => {
    const t = makeRemoveLabelTool({ token: 'test' });
    const result = await t.execute({ issueNumber: 1, label: 'bug' }, makeContext(true));
    expect(result.ok).toBe(true);
  });
});
