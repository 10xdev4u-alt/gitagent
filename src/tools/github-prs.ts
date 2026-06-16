/**
 * GitHub tools for pull requests: create_pr, request_review, merge_pr, add_reaction.
 */

import { z } from 'zod';
import { ToolError } from './errors.js';
import type { GitHubClientOptions } from './github-client.js';
import { createGitHubClient } from './github-client.js';
import type { ToolDefinition } from './types.js';

export function makeCreatePRTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.create_pr',
    description: 'Create a new pull request. Requires a head branch with commits.',
    inputSchema: z.object({
      title: z.string().min(1).max(256).describe('PR title'),
      body: z.string().describe('PR description, in markdown'),
      head: z.string().describe('The branch containing the changes'),
      base: z.string().describe('The branch to merge into'),
      draft: z.boolean().default(false).describe('Create as a draft PR'),
    }),
    execute: async (input, ctx) => {
      const args = input as { title: string; body: string; head: string; base: string; draft: boolean };
      if (ctx.dryRun) {
        ctx.logger.info(`[dry-run] would create PR: ${args.title}`);
        return { ok: true, output: { dryRun: true, url: 'https://github.com/dryrun/PR' } };
      }
      try {
        const client = await createGitHubClient(options);
        const res = await client.pulls.create({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          title: args.title,
          body: args.body,
          head: args.head,
          base: args.base,
          draft: args.draft,
        });
        return { ok: true, output: { number: res.data.number, url: res.data.html_url } };
      } catch (err) {
        throw new ToolError('github.create_pr', 'GITHUB_API_ERROR', `Failed to create PR: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}

export function makeRequestReviewTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.request_review',
    description: 'Request a review from one or more users or teams on a pull request.',
    inputSchema: z.object({
      pullNumber: z.number().int().positive().describe('The PR number'),
      reviewers: z.array(z.string()).default([]).describe('GitHub usernames to request review from'),
      teamReviewers: z.array(z.string()).default([]).describe('Team slugs to request review from'),
    }),
    execute: async (input, ctx) => {
      const args = input as { pullNumber: number; reviewers: string[]; teamReviewers: string[] };
      if (ctx.dryRun) {
        ctx.logger.info(`[dry-run] would request review for PR #${args.pullNumber}`);
        return { ok: true, output: { dryRun: true } };
      }
      try {
        const client = await createGitHubClient(options);
        const res = await client.pulls.requestReviewers({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          pull_number: args.pullNumber,
          reviewers: args.reviewers,
          team_reviewers: args.teamReviewers,
        });
        return { ok: true, output: { reviewers: res.data.requested_reviewers?.map((r) => r.login) ?? [] } };
      } catch (err) {
        throw new ToolError('github.request_review', 'GITHUB_API_ERROR', `Failed to request review: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}

export function makeMergePRTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.merge_pr',
    description: 'Merge a pull request. Supports squash, rebase, and merge commit strategies.',
    inputSchema: z.object({
      pullNumber: z.number().int().positive().describe('The PR number'),
      mergeMethod: z.enum(['merge', 'squash', 'rebase']).default('squash').describe('Merge strategy'),
      commitMessage: z.string().optional().describe('Optional commit message'),
    }),
    execute: async (input, ctx) => {
      const args = input as { pullNumber: number; mergeMethod: 'merge' | 'squash' | 'rebase'; commitMessage?: string };
      if (ctx.dryRun) {
        ctx.logger.info(`[dry-run] would merge PR #${args.pullNumber}`);
        return { ok: true, output: { dryRun: true, merged: true } };
      }
      try {
        const client = await createGitHubClient(options);
        const res = await client.pulls.merge({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          pull_number: args.pullNumber,
          merge_method: args.mergeMethod,
          ...(args.commitMessage ? { commit_message: args.commitMessage } : {}),
        });
        return { ok: true, output: { merged: res.data.merged, sha: res.data.sha, message: res.data.message } };
      } catch (err) {
        throw new ToolError('github.merge_pr', 'GITHUB_API_ERROR', `Failed to merge PR: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}

export function makeAddReactionTool(options: GitHubClientOptions): ToolDefinition {
  return {
    name: 'github.add_reaction',
    description: 'Add a reaction to an issue, PR, or comment.',
    inputSchema: z.object({
      target: z.enum(['issue', 'comment']).describe('What to react to'),
      id: z.number().int().positive().describe('The issue/comment id'),
      reaction: z.enum(['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes']).describe('The reaction'),
    }),
    execute: async (input, ctx) => {
      const args = input as { target: 'issue' | 'comment'; id: number; reaction: string };
      if (ctx.dryRun) {
        ctx.logger.info(`[dry-run] would add ${args.reaction} reaction`);
        return { ok: true, output: { dryRun: true } };
      }
      try {
        const client = await createGitHubClient(options);
        if (args.target === 'issue') {
          await client.reactions.createForIssue({
            owner: ctx.repo.owner,
            repo: ctx.repo.name,
            issue_number: args.id,
            content: args.reaction as never,
          });
        } else {
          await client.reactions.createForIssueComment({
            owner: ctx.repo.owner,
            repo: ctx.repo.name,
            comment_id: args.id,
            content: args.reaction as never,
          });
        }
        return { ok: true, output: { added: args.reaction } };
      } catch (err) {
        throw new ToolError('github.add_reaction', 'GITHUB_API_ERROR', `Failed to add reaction: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}
