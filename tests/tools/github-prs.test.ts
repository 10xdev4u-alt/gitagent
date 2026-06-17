/**
 * Tests for the GitHub PR tools.
 */

import { describe, expect, it } from 'vitest';
import { makeCreatePRTool, makeMergePRTool, makeRequestReviewTool, makeAddReactionTool } from '../../src/tools/github-prs.js';

function noopLogger() {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

function makeContext(dryRun = false) {
  return {
    agentName: 'test',
    runId: 'r1',
    repo: { owner: 'foo', name: 'bar' },
    event: { name: 'pull_request.opened', payload: {} },
    dryRun,
    logger: noopLogger(),
  };
}

describe('makeCreatePRTool', () => {
  it('has the right name', () => {
    const t = makeCreatePRTool({ token: 'test' });
    expect(t.name).toBe('github.create_pr');
  });

  it('requires title, head, and base', () => {
    const t = makeCreatePRTool({ token: 'test' });
    expect(t.inputSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a valid input', () => {
    const t = makeCreatePRTool({ token: 'test' });
    const r = t.inputSchema.safeParse({ title: 'My PR', body: 'desc', head: 'feature', base: 'main' });
    expect(r.success).toBe(true);
  });

  it('dry-run returns ok', async () => {
    const t = makeCreatePRTool({ token: 'test' });
    const result = await t.execute({ title: 'My PR', head: 'feature', base: 'main' }, makeContext(true));
    expect(result.ok).toBe(true);
  });
});

describe('makeMergePRTool', () => {
  it('has the right name', () => {
    const t = makeMergePRTool({ token: 'test' });
    expect(t.name).toBe('github.merge_pr');
  });

  it('requires pullNumber', () => {
    const t = makeMergePRTool({ token: 'test' });
    expect(t.inputSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a valid input', () => {
    const t = makeMergePRTool({ token: 'test' });
    const r = t.inputSchema.safeParse({ pullNumber: 1 });
    expect(r.success).toBe(true);
  });

  it('dry-run returns ok', async () => {
    const t = makeMergePRTool({ token: 'test' });
    const result = await t.execute({ pullNumber: 1 }, makeContext(true));
    expect(result.ok).toBe(true);
  });
});

describe('makeRequestReviewTool', () => {
  it('has the right name', () => {
    const t = makeRequestReviewTool({ token: 'test' });
    expect(t.name).toBe('github.request_review');
  });

  it('requires pullNumber and reviewers', () => {
    const t = makeRequestReviewTool({ token: 'test' });
    expect(t.inputSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a valid input', () => {
    const t = makeRequestReviewTool({ token: 'test' });
    const r = t.inputSchema.safeParse({ pullNumber: 1, reviewers: ['alice'] });
    expect(r.success).toBe(true);
  });

  it('dry-run returns ok', async () => {
    const t = makeRequestReviewTool({ token: 'test' });
    const result = await t.execute({ pullNumber: 1, reviewers: ['alice'] }, makeContext(true));
    expect(result.ok).toBe(true);
  });
});

describe('makeAddReactionTool', () => {
  it('has the right name', () => {
    const t = makeAddReactionTool({ token: 'test' });
    expect(t.name).toBe('github.add_reaction');
  });

  it('requires all fields', () => {
    const t = makeAddReactionTool({ token: 'test' });
    expect(t.inputSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a valid input', () => {
    const t = makeAddReactionTool({ token: 'test' });
    const r = t.inputSchema.safeParse({ target: 'issue', id: 1, reaction: 'eyes' });
    expect(r.success).toBe(true);
  });

  it('dry-run returns ok', async () => {
    const t = makeAddReactionTool({ token: 'test' });
    const result = await t.execute({ target: 'issue', id: 1, reaction: 'eyes' }, makeContext(true));
    expect(result.ok).toBe(true);
  });
});
