/**
 * Tests for the GitHub issue tools.
 */

import { describe, expect, it, vi } from 'vitest';
import { makeCreateIssueTool, makeUpdateIssueTool } from '../../src/tools/github-issues.js';

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

describe('makeCreateIssueTool', () => {
  it('has the right name and description', () => {
    const t = makeCreateIssueTool({ token: 'test' });
    expect(t.name).toBe('github.create_issue');
    expect(t.description).toContain('issue');
  });

  it('requires title and body', () => {
    const t = makeCreateIssueTool({ token: 'test' });
    expect(t.inputSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a valid input', () => {
    const t = makeCreateIssueTool({ token: 'test' });
    const r = t.inputSchema.safeParse({ title: 'Bug', body: 'Steps to reproduce' });
    expect(r.success).toBe(true);
  });

  it('accepts optional labels', () => {
    const t = makeCreateIssueTool({ token: 'test' });
    const r = t.inputSchema.safeParse({ title: 'Bug', body: 'X', labels: ['bug'] });
    expect(r.success).toBe(true);
  });

  it('dry-run returns ok without calling API', async () => {
    const t = makeCreateIssueTool({ token: 'test' });
    const result = await t.execute({ title: 'Bug', body: 'X' }, makeContext(true));
    expect(result.ok).toBe(true);
  });
});

describe('makeUpdateIssueTool', () => {
  it('has the right name', () => {
    const t = makeUpdateIssueTool({ token: 'test' });
    expect(t.name).toBe('github.update_issue');
  });

  it('requires issueNumber', () => {
    const t = makeUpdateIssueTool({ token: 'test' });
    expect(t.inputSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a valid input', () => {
    const t = makeUpdateIssueTool({ token: 'test' });
    const r = t.inputSchema.safeParse({ issueNumber: 1, state: 'closed' });
    expect(r.success).toBe(true);
  });

  it('accepts optional body and title', () => {
    const t = makeUpdateIssueTool({ token: 'test' });
    const r = t.inputSchema.safeParse({ issueNumber: 1, title: 'New title' });
    expect(r.success).toBe(true);
  });

  it('dry-run returns ok without calling API', async () => {
    const t = makeUpdateIssueTool({ token: 'test' });
    const result = await t.execute({ issueNumber: 1, state: 'closed' }, makeContext(true));
    expect(result.ok).toBe(true);
  });
});
