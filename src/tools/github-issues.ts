/**
 * GitHub tools: close_issue, reopen_issue, assign, unassign, search_issues.
 */

import { z } from 'zod';
import { ToolError } from './errors.js';
import type { GitHubClientOptions } from './github-client.js';
import { createGitHubClient } from './github-client.js';
import type { ToolDefinition } from './types.js';

export function makeCloseIssueTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.close_issue',
    description: 'Close an issue or pull request. Optionally include a closing comment.',
    inputSchema: z.object({
      issueNumber: z.number().int().positive().describe('The issue or PR number'),
      comment: z.string().optional().describe('Optional comment to post before closing'),
      reason: z.enum(['completed', 'not_planned']).optional().describe('Closure reason (issues only)'),
    }),
    execute: async (input, ctx) => {
      const args = input as { issueNumber: number; comment?: string; reason?: 'completed' | 'not_planned' };
      if (ctx.dryRun) {
        ctx.logger.info(`[dry-run] would close #${args.issueNumber}`);
        return { ok: true, output: { dryRun: true } };
      }
      try {
        const client = await createGitHubClient(options);
        if (args.comment) {
          await client.issues.createComment({
            owner: ctx.repo.owner,
            repo: ctx.repo.name,
            issue_number: args.issueNumber,
            body: args.comment,
          });
        }
        const res = await client.issues.update({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          issue_number: args.issueNumber,
          state: 'closed',
          state_reason: args.reason,
        });
        return { ok: true, output: { state: res.data.state, state_reason: res.data.state_reason } };
      } catch (err) {
        throw new ToolError('github.close_issue', 'GITHUB_API_ERROR', `Failed to close: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}

export function makeReopenIssueTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.reopen_issue',
    description: 'Reopen a closed issue or pull request.',
    inputSchema: z.object({
      issueNumber: z.number().int().positive().describe('The issue or PR number'),
    }),
    execute: async (input, ctx) => {
      const args = input as { issueNumber: number };
      if (ctx.dryRun) {
        ctx.logger.info(`[dry-run] would reopen #${args.issueNumber}`);
        return { ok: true, output: { dryRun: true } };
      }
      try {
        const client = await createGitHubClient(options);
        const res = await client.issues.update({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          issue_number: args.issueNumber,
          state: 'open',
        });
        return { ok: true, output: { state: res.data.state } };
      } catch (err) {
        throw new ToolError('github.reopen_issue', 'GITHUB_API_ERROR', `Failed to reopen: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}

export function makeAssignTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.assign',
    description: 'Assign users to an issue or pull request. Pass an empty array to clear assignments.',
    inputSchema: z.object({
      issueNumber: z.number().int().positive().describe('The issue or PR number'),
      assignees: z.array(z.string()).describe('GitHub usernames to assign'),
    }),
    execute: async (input, ctx) => {
      const args = input as { issueNumber: number; assignees: string[] };
      if (ctx.dryRun) {
        ctx.logger.info(`[dry-run] would assign ${args.assignees.join(', ')} to #${args.issueNumber}`);
        return { ok: true, output: { dryRun: true } };
      }
      try {
        const client = await createGitHubClient(options);
        const res = await client.issues.addAssignees({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          issue_number: args.issueNumber,
          assignees: args.assignees,
        });
        return { ok: true, output: { assignees: res.data.assignees?.map((a) => a.login) ?? [] } };
      } catch (err) {
        throw new ToolError('github.assign', 'GITHUB_API_ERROR', `Failed to assign: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}

export function makeSearchIssuesTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.search_issues',
    description: 'Search for issues and pull requests. Returns up to `perPage` results.',
    inputSchema: z.object({
      query: z.string().min(1).describe('Search query in GitHub search syntax (e.g. "is:issue is:open label:bug")'),
      perPage: z.number().int().min(1).max(100).default(20).describe('Max results (1-100)'),
    }),
    execute: async (input, ctx) => {
      const args = input as { query: string; perPage: number };
      try {
        const client = await createGitHubClient(options);
        // Scope to the current repo unless the user explicitly searches globally
        const scopedQuery = args.query.includes('repo:') ? args.query : `repo:${ctx.repo.owner}/${ctx.repo.name} ${args.query}`;
        const res = await client.search.issuesAndPullRequests({
          q: scopedQuery,
          per_page: args.perPage,
        });
        return {
          ok: true,
          output: {
            totalCount: res.data.total_count,
            items: res.data.items.map((i) => ({
              number: i.number,
              title: i.title,
              state: i.state,
              url: i.html_url,
              labels: i.labels.map((l) => (typeof l === 'string' ? l : l.name ?? '')),
              createdAt: i.created_at,
            })),
          },
        };
      } catch (err) {
        throw new ToolError('github.search_issues', 'GITHUB_API_ERROR', `Search failed: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}
