/**
 * Tests for the read-only GitHub tools.
 */

import { describe, expect, it, vi } from 'vitest';
import { createDefaultToolRegistry } from '../../src/tools/defaults.js';
import type { Octokit } from '@octokit/rest';
import type { ToolContext } from '../../src/tools/types.js';

const ctx: ToolContext = {
  agentName: 'test',
  runId: 'run-1',
  repo: { owner: 'me', name: 'r' },
  event: { name: 'issues.opened', payload: {} },
  dryRun: false,
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
};

function makeMockClient(overrides: Partial<Octokit> = {}) {
  return {
    repos: {
      getContent: vi.fn(async () => ({
        data: {
          type: 'file',
          content: Buffer.from('hello world').toString('base64'),
          encoding: 'base64',
          size: 11,
          name: 'README.md',
        },
      })),
    },
    actions: {
      listWorkflowRuns: vi.fn(async () => ({ data: { total_count: 0, workflow_runs: [] } })),
      listWorkflowRunsForRepo: vi.fn(async () => ({
        data: {
          total_count: 1,
          workflow_runs: [
            {
              id: 1,
              name: 'CI',
              path: '.github/workflows/ci.yml',
              head_branch: 'main',
              head_sha: 'abc',
              status: 'completed',
              conclusion: 'success',
              html_url: 'https://gh/runs/1',
              created_at: '2026-01-01',
            },
          ],
        },
      })),
    },
    issues: {
      listForRepo: vi.fn(async () => ({ data: [] })),
    },
    pulls: {
      list: vi.fn(async () => ({ data: [] })),
    },
    ...overrides,
  } as unknown as Octokit;
}

describe('github.get_file', () => {
  it('reads a file and returns decoded content', async () => {
    const client = makeMockClient();
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    const r = await reg.require('github.get_file').execute({ path: 'README.md' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toMatchObject({ path: 'README.md', content: 'hello world', size: 11 });
  });

  it('returns ok=false with not-found for 404', async () => {
    const err = Object.assign(new Error('not found'), { status: 404 });
    const client = makeMockClient({ repos: { getContent: vi.fn(async () => { throw err; }) } as never });
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    const r = await reg.require('github.get_file').execute({ path: 'nope.md' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('not found');
  });

  it('passes ref when provided', async () => {
    const client = makeMockClient();
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    await reg.require('github.get_file').execute({ path: 'src/x.ts', ref: 'feature' }, ctx);
    expect(client.repos.getContent).toHaveBeenCalledWith({
      owner: 'me',
      repo: 'r',
      path: 'src/x.ts',
      ref: 'feature',
    });
  });
});

describe('github.list_workflow_runs', () => {
  it('lists runs', async () => {
    const client = makeMockClient();
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    const r = await reg.require('github.list_workflow_runs').execute({ perPage: 10 }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toMatchObject({ totalCount: 1 });
    expect((r.output as { runs: unknown[] }).runs).toHaveLength(1);
  });

  it('filters by workflow id', async () => {
    const client = makeMockClient();
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    await reg.require('github.list_workflow_runs').execute(
      { workflowId: 'ci.yml', perPage: 5 },
      ctx,
    );
    expect(client.actions.listWorkflowRuns).toHaveBeenCalled();
  });
});

describe('github.list_issues', () => {
  it('lists issues with default state', async () => {
    const client = makeMockClient();
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    const r = await reg.require('github.list_issues').execute({ state: 'open', labels: [], perPage: 20 }, ctx);
    expect(r.ok).toBe(true);
    expect(client.issues.listForRepo).toHaveBeenCalledWith({
      owner: 'me',
      repo: 'r',
      state: 'open',
      labels: '',
      assignee: undefined,
      per_page: 20,
    });
  });
});

describe('github.list_pull_requests', () => {
  it('lists PRs with base branch filter', async () => {
    const client = makeMockClient();
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    const r = await reg.require('github.list_pull_requests').execute(
      { state: 'open', base: 'main', perPage: 10 },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(client.pulls.list).toHaveBeenCalledWith({
      owner: 'me',
      repo: 'r',
      state: 'open',
      base: 'main',
      per_page: 10,
    });
  });
});
