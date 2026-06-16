/**
 * GitHub tools: post_comment, add_labels, remove_labels.
 *
 * These are the most common "respond" tools an agent will use.
 */

import { z } from 'zod';
import { ToolError } from './errors.js';
import type { GitHubClientOptions } from './github-client.js';
import { createGitHubClient } from './github-client.js';
import type { ToolContext, ToolDefinition } from './types.js';

/**
 * Create a tool that posts a comment on an issue or PR.
 *
 * Inputs: { owner, repo, issueNumber, body }
 *   - owner + repo default to the context's repo
 *   - body is the comment markdown
 */
export function makePostCommentTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.post_comment',
    description: 'Post a comment on an issue or pull request. Use markdown for formatting.',
    inputSchema: z.object({
      issueNumber: z.number().int().positive().describe('The issue or PR number'),
      body: z.string().min(1).max(65536).describe('The comment body, in markdown'),
    }),
    execute: async (input, ctx) => {
      const args = input as { issueNumber: number; body: string };
      if (ctx.dryRun) {
        ctx.logger.info(`[dry-run] would post comment on #${args.issueNumber}`);
        return { ok: true, output: { dryRun: true, url: `https://github.com/${ctx.repo.owner}/${ctx.repo.name}/issues/${args.issueNumber}#issuecomment-dryrun` } };
      }
      try {
        const client = await createGitHubClient(options);
        const res = await client.issues.createComment({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          issue_number: args.issueNumber,
          body: args.body,
        });
        return { ok: true, output: { id: res.data.id, url: res.data.html_url } };
      } catch (err) {
        throw new ToolError('github.post_comment', 'GITHUB_API_ERROR', `Failed to post comment: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}

/**
 * Create a tool that adds labels to an issue or PR.
 */
export function makeAddLabelsTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.add_labels',
    description: 'Add one or more labels to an issue or pull request. Labels must already exist in the repo.',
    inputSchema: z.object({
      issueNumber: z.number().int().positive().describe('The issue or PR number'),
      labels: z.array(z.string().min(1)).min(1).describe('Label names to add'),
    }),
    execute: async (input, ctx) => {
      const args = input as { issueNumber: number; labels: string[] };
      if (ctx.dryRun) {
        ctx.logger.info(`[dry-run] would add labels ${args.labels.join(', ')} to #${args.issueNumber}`);
        return { ok: true, output: { dryRun: true } };
      }
      try {
        const client = await createGitHubClient(options);
        const res = await client.issues.addLabels({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          issue_number: args.issueNumber,
          labels: args.labels,
        });
        return { ok: true, output: { labels: res.data.map((l) => l.name) } };
      } catch (err) {
        throw new ToolError('github.add_labels', 'GITHUB_API_ERROR', `Failed to add labels: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}

/**
 * Create a tool that removes a label from an issue or PR.
 */
export function makeRemoveLabelTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.remove_label',
    description: 'Remove a label from an issue or pull request.',
    inputSchema: z.object({
      issueNumber: z.number().int().positive().describe('The issue or PR number'),
      label: z.string().min(1).describe('The label name to remove'),
    }),
    execute: async (input, ctx) => {
      const args = input as { issueNumber: number; label: string };
      if (ctx.dryRun) {
        ctx.logger.info(`[dry-run] would remove label ${args.label} from #${args.issueNumber}`);
        return { ok: true, output: { dryRun: true } };
      }
      try {
        const client = await createGitHubClient(options);
        await client.issues.removeLabel({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          issue_number: args.issueNumber,
          name: args.label,
        });
        return { ok: true, output: { removed: args.label } };
      } catch (err) {
        throw new ToolError('github.remove_label', 'GITHUB_API_ERROR', `Failed to remove label: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}
