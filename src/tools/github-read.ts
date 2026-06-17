/**
 * GitHub tools for reading file contents, listing workflow runs, and other
 * read-only inspection tasks. These are the "look at the repo" tools.
 */

import { z } from 'zod';
import { ToolError } from './errors.js';
import type { GitHubClientOptions } from './github-client.js';
import { createGitHubClient } from './github-client.js';
import type { ToolDefinition } from './types.js';

export function makeGetFileTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.get_file',
    description: 'Read a file from the repository. Returns the content and metadata.',
    inputSchema: z.object({
      path: z.string().min(1).describe('Path to the file, e.g. "src/index.ts"'),
      ref: z.string().optional().describe('Branch, tag, or SHA (defaults to default branch)'),
    }),
    execute: async (input, ctx) => {
      const args = input as { path: string; ref?: string };
      try {
        const client = await createGitHubClient(options);
        const res = await client.repos.getContent({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          path: args.path,
          ...(args.ref ? { ref: args.ref } : {}),
        });
        const data = res.data as { content?: string; encoding?: string; size?: number; name?: string; type?: string };
        if (Array.isArray(data) || data.type !== 'file') {
          return { ok: false, error: `Path ${args.path} is not a file` };
        }
        const decoded = data.encoding === 'base64' ? Buffer.from(data.content ?? '', 'base64').toString('utf8') : data.content ?? '';
        return { ok: true, output: { path: args.path, content: decoded, size: data.size ?? decoded.length } };
      } catch (err) {
        const e = err as { status?: number };
        if (e.status === 404) return { ok: false, error: `File not found: ${args.path}` };
        throw new ToolError('github.get_file', 'GITHUB_API_ERROR', `Failed to read file: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}

export function makeListWorkflowRunsTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.list_workflow_runs',
    description: 'List recent workflow runs for the repository. Useful for checking CI status.',
    inputSchema: z.object({
      workflowId: z.string().optional().describe('Filter by workflow file name or ID'),
      branch: z.string().optional().describe('Filter by branch'),
      status: z.enum(['queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending']).optional(),
      conclusion: z.enum(['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required']).optional(),
      perPage: z.number().int().min(1).max(100).default(20),
    }),
    execute: async (input, ctx) => {
      const args = input as {
        workflowId?: string;
        branch?: string;
        status?: string;
        conclusion?: string;
        perPage: number;
      };
      try {
        const client = await createGitHubClient(options);
        const params: Record<string, unknown> = { per_page: args.perPage };
        if (args.branch) params.branch = args.branch;
        if (args.status) params.status = args.status;
        if (args.conclusion) params.conclusion = args.conclusion;

        const res = args.workflowId
          ? await client.actions.listWorkflowRuns({
              owner: ctx.repo.owner,
              repo: ctx.repo.name,
              workflow_id: args.workflowId,
              branch: args.branch as never,
              status: args.status as never,
              conclusion: args.conclusion as never,
              per_page: args.perPage,
            })
          : await client.actions.listWorkflowRunsForRepo({
              owner: ctx.repo.owner,
              repo: ctx.repo.name,
              branch: args.branch as never,
              status: args.status as never,
              conclusion: args.conclusion as never,
              per_page: args.perPage,
            });
        return {
          ok: true,
          output: {
            totalCount: res.data.total_count,
            runs: res.data.workflow_runs.map((r) => ({
              id: r.id,
              name: r.name,
              workflow: r.path,
              branch: r.head_branch,
              sha: r.head_sha,
              status: r.status,
              conclusion: r.conclusion,
              url: r.html_url,
              createdAt: r.created_at,
            })),
          },
        };
      } catch (err) {
        throw new ToolError('github.list_workflow_runs', 'GITHUB_API_ERROR', `Failed to list runs: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}export function makeListIssuesTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.list_issues',
    description: 'List issues in the repository. Optionally filter by state, labels, or assignee.',
    inputSchema: z.object({
      state: z.enum(['open', 'closed', 'all']).default('open'),
      labels: z.array(z.string()).default([]).describe('Filter by label names'),
      assignee: z.string().optional().describe('Filter by assignee username'),
      perPage: z.number().int().min(1).max(100).default(20),
    }),
    execute: async (input, ctx) => {
      const args = input as { state: 'open' | 'closed' | 'all'; labels: string[]; assignee?: string; perPage: number };
      try {
        const client = await createGitHubClient(options);
        const res = await client.issues.listForRepo({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          state: args.state,
          labels: args.labels.join(','),
          assignee: args.assignee,
          per_page: args.perPage,
        });
        return {
          ok: true,
          output: {
            count: res.data.length,
            issues: res.data.map((i) => ({
              number: i.number,
              title: i.title,
              state: i.state,
              url: i.html_url,
              author: i.user?.login,
              labels: i.labels.map((l) => (typeof l === 'string' ? l : l.name ?? '')),
              createdAt: i.created_at,
            })),
          },
        };
      } catch (err) {
        throw new ToolError('github.list_issues', 'GITHUB_API_ERROR', `Failed to list issues: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}

export function makeListPullRequestsTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.list_pull_requests',
    description: 'List pull requests in the repository. Filter by state, base, head, or author.',
    inputSchema: z.object({
      state: z.enum(['open', 'closed', 'all']).default('open'),
      base: z.string().optional().describe('Filter by base branch'),
      head: z.string().optional().describe('Filter by head branch or user:branch'),
      author: z.string().optional().describe('Filter by author username'),
      perPage: z.number().int().min(1).max(100).default(20),
    }),
    execute: async (input, ctx) => {
      const args = input as { state: 'open' | 'closed' | 'all'; base?: string; head?: string; author?: string; perPage: number };
      try {
        const client = await createGitHubClient(options);
        const res = await client.pulls.list({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          state: args.state,
          ...(args.base ? { base: args.base } : {}),
          ...(args.head ? { head: args.head } : {}),
          per_page: args.perPage,
        });
        return {
          ok: true,
          output: {
            count: res.data.length,
            pulls: res.data.map((p) => ({
              number: p.number,
              title: p.title,
              state: p.state,
              draft: p.draft,
              merged: (p as { merged?: boolean }).merged ?? false,
              url: p.html_url,
              author: p.user?.login,
              base: p.base.ref,
              head: p.head.ref,
              createdAt: p.created_at,
            })),
          },
        };
      } catch (err) {
        throw new ToolError('github.list_pull_requests', 'GITHUB_API_ERROR', `Failed to list PRs: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}
