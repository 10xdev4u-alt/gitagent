/**
 * Tests for the GitHub comment + label tools.
 *
 * Uses a mocked Octokit client factory to avoid hitting the real GitHub API.
 */

import { describe, expect, it, vi } from 'vitest';
import { createDefaultToolRegistry } from '../../src/tools/defaults.js';
import type { Octokit } from '@octokit/rest';
import type { ToolContext } from '../../src/tools/types.js';

function makeMockOctokit(overrides: Partial<Octokit> = {}) {
  return {
    issues: {
      createComment: vi.fn(async () => ({ data: { id: 1, html_url: 'https://gh/comment/1' } })),
      addLabels: vi.fn(async () => ({ data: [{ name: 'bug' }] })),
      removeLabel: vi.fn(async () => ({})),
      update: vi.fn(async () => ({ data: { state: 'closed', state_reason: 'completed' } })),
      addAssignees: vi.fn(async () => ({ data: { assignees: [{ login: 'me' }] } })),
    },
    pulls: {
      create: vi.fn(async () => ({ data: { number: 2, html_url: 'https://gh/pr/2' } })),
      requestReviewers: vi.fn(async () => ({ data: { requested_reviewers: [{ login: 'r' }] } })),
      merge: vi.fn(async () => ({ data: { merged: true, sha: 'abc', message: 'ok' } })),
    },
    reactions: {
      createForIssue: vi.fn(async () => ({})),
      createForIssueComment: vi.fn(async () => ({})),
    },
    search: {
      issuesAndPullRequests: vi.fn(async () => ({
        data: {
          total_count: 1,
          items: [
            { number: 1, title: 'x', state: 'open', html_url: 'u', labels: [], created_at: '2026-01-01' },
          ],
        },
      })),
    },
    ...overrides,
  } as unknown as Octokit;
}

const ctx: ToolContext = {
  agentName: 'test',
  runId: 'run-1',
  repo: { owner: 'me', name: 'r' },
  event: { name: 'issues.opened', payload: {} },
  dryRun: false,
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
};

describe('github.post_comment', () => {
  it('posts a comment and returns the URL', async () => {
    const client = makeMockOctokit();
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    const r = await reg.require('github.post_comment').execute(
      { issueNumber: 7, body: 'hi' },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(client.issues.createComment).toHaveBeenCalledWith({
      owner: 'me',
      repo: 'r',
      issue_number: 7,
      body: 'hi',
    });
  });

  it('does not call API in dry-run', async () => {
    const client = makeMockOctokit();
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    const r = await reg.require('github.post_comment').execute(
      { issueNumber: 7, body: 'hi' },
      { ...ctx, dryRun: true },
    );
    expect(r.ok).toBe(true);
    expect(r.output).toMatchObject({ dryRun: true });
    expect(client.issues.createComment).not.toHaveBeenCalled();
  });
});

describe('github.add_labels', () => {
  it('adds labels', async () => {
    const client = makeMockOctokit();
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    const r = await reg.require('github.add_labels').execute(
      { issueNumber: 1, labels: ['bug', 'p0'] },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(client.issues.addLabels).toHaveBeenCalled();
  });
});

describe('github.close_issue', () => {
  it('closes with a comment', async () => {
    const client = makeMockOctokit();
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    const r = await reg.require('github.close_issue').execute(
      { issueNumber: 1, comment: 'bye', reason: 'completed' },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(client.issues.createComment).toHaveBeenCalled();
    expect(client.issues.update).toHaveBeenCalledWith({
      owner: 'me',
      repo: 'r',
      issue_number: 1,
      state: 'closed',
      state_reason: 'completed',
    });
  });
});

describe('github.search_issues', () => {
  it('scopes search to the current repo by default', async () => {
    const client = makeMockOctokit();
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    await reg.require('github.search_issues').execute({ query: 'is:open', perPage: 5 }, ctx);
    expect(client.search.issuesAndPullRequests).toHaveBeenCalledWith({
      q: 'repo:me/r is:open',
      per_page: 5,
    });
  });

  it('respects explicit repo: in the query', async () => {
    const client = makeMockOctokit();
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    await reg.require('github.search_issues').execute(
      { query: 'repo:other/x is:open', perPage: 5 },
      ctx,
    );
    expect(client.search.issuesAndPullRequests).toHaveBeenCalledWith({
      q: 'repo:other/x is:open',
      per_page: 5,
    });
  });
});

describe('github.create_pr', () => {
  it('creates a PR', async () => {
    const client = makeMockOctokit();
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    const r = await reg.require('github.create_pr').execute(
      { title: 'x', body: 'b', head: 'feat', base: 'main', draft: false },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(client.pulls.create).toHaveBeenCalled();
  });
});

describe('github.merge_pr', () => {
  it('merges with default squash', async () => {
    const client = makeMockOctokit();
    const reg = createDefaultToolRegistry({ token: 't', clientFactory: () => client });
    const r = await reg.require('github.merge_pr').execute(
      { pullNumber: 5, mergeMethod: 'squash' },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(client.pulls.merge).toHaveBeenCalledWith({
      owner: 'me',
      repo: 'r',
      pull_number: 5,
      merge_method: 'squash',
    });
  });
});
