/**
 * Tests for the GitHub read tools.
 */

import { describe, expect, it } from 'vitest';
import { makeGetFileTool, makeListIssuesTool, makeListPullRequestsTool, makeListWorkflowRunsTool } from '../../src/tools/github-read.js';

function noopLogger() {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

function makeContext() {
  return {
    agentName: 'test',
    runId: 'r1',
    repo: { owner: 'foo', name: 'bar' },
    event: { name: 'issues.opened', payload: {} },
    dryRun: false,
    logger: noopLogger(),
  };
}

describe('makeGetFileTool', () => {
  it('has the right name', () => {
    const t = makeGetFileTool({ token: 'test' });
    expect(t.name).toBe('github.get_file');
  });

  it('requires a path', () => {
    const t = makeGetFileTool({ token: 'test' });
    expect(t.inputSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a valid input', () => {
    const t = makeGetFileTool({ token: 'test' });
    const r = t.inputSchema.safeParse({ path: 'README.md' });
    expect(r.success).toBe(true);
  });
});

describe('makeListIssuesTool', () => {
  it('has the right name', () => {
    const t = makeListIssuesTool({ token: 'test' });
    expect(t.name).toBe('github.list_issues');
  });

  it('accepts an empty input', () => {
    const t = makeListIssuesTool({ token: 'test' });
    const r = t.inputSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('accepts a state filter', () => {
    const t = makeListIssuesTool({ token: 'test' });
    const r = t.inputSchema.safeParse({ state: 'open' });
    expect(r.success).toBe(true);
  });
});

describe('makeListPullRequestsTool', () => {
  it('has the right name', () => {
    const t = makeListPullRequestsTool({ token: 'test' });
    expect(t.name).toBe('github.list_pull_requests');
  });

  it('accepts an empty input', () => {
    const t = makeListPullRequestsTool({ token: 'test' });
    const r = t.inputSchema.safeParse({});
    expect(r.success).toBe(true);
  });
});

describe('makeListWorkflowRunsTool', () => {
  it('has the right name', () => {
    const t = makeListWorkflowRunsTool({ token: 'test' });
    expect(t.name).toBe('github.list_workflow_runs');
  });

  it('accepts an empty input', () => {
    const t = makeListWorkflowRunsTool({ token: 'test' });
    const r = t.inputSchema.safeParse({});
    expect(r.success).toBe(true);
  });
});
