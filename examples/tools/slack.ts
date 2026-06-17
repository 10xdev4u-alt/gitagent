/**
 * Example custom tool: send a Slack message.
 *
 * Demonstrates how to write a custom tool that integrates with an
 * external service. The Slack API isn't bundled with gitagent; this
 * file is a pattern, not a working implementation.
 *
 * To make this work in your repo:
 * 1. Add `@slack/web-api` to your dependencies
 * 2. Set the `SLACK_BOT_TOKEN` env var
 * 3. Register the tool in your agent's `tools:` list:
 *    ```yaml
 *    tools:
 *      - slack.send_message
 *    ```
 */

import { z } from 'zod';
import { ToolError } from '../errors.js';
import type { ToolDefinition } from '../types.js';

export interface SlackToolOptions {
  token: string;
  defaultChannel?: string;
}

let cachedWebApi: unknown = null;

async function loadSlackWebApi(): Promise<unknown> {
  if (cachedWebApi) return cachedWebApi;
  try {
    const mod = await import('@slack/web-api');
    cachedWebApi = mod.WebClient;
    return cachedWebApi;
  } catch (err) {
    throw new ToolError(
      'slack.send_message',
      'TOOL_NOT_FOUND',
      '@slack/web-api is not installed. Run `npm install @slack/web-api` to add it.',
      { cause: err },
    );
  }
}

/**
 * Create a `slack.send_message` tool that posts a message to a Slack
 * channel.
 */
export function makeSlackSendMessageTool(options: SlackToolOptions): ToolDefinition {
  return {
    name: 'slack.send_message',
    description: 'Post a message to a Slack channel. Use channel names like "#general" or channel IDs.',
    inputSchema: z.object({
      channel: z.string().describe('Channel name (e.g. "#general") or ID'),
      text: z.string().min(1).max(40000).describe('The message text, supports Slack markdown'),
      threadTs: z.string().optional().describe('Reply in a thread (parent message timestamp)'),
    }),
    execute: async (input, ctx) => {
      const args = input as { channel: string; text: string; threadTs?: string };
      if (ctx.dryRun) {
        ctx.logger.info(`[dry-run] would post to ${args.channel}: ${args.text.slice(0, 50)}...`);
        return { ok: true, output: { dryRun: true, channel: args.channel, ts: 'dry-run' } };
      }
      try {
        const WebClient = (await loadSlackWebApi()) as new (token: string) => { chat: { postMessage: (args: unknown) => Promise<{ ok: boolean; ts?: string; error?: string }> } };
        const client = new WebClient(options.token);
        const channel = args.channel.startsWith('#')
          ? args.channel.slice(1) // remove leading #
          : args.channel;
        const res = await client.chat.postMessage({
          channel,
          text: args.text,
          ...(args.threadTs ? { thread_ts: args.threadTs } : {}),
        });
        if (!res.ok) {
          return { ok: false, error: res.error ?? 'Slack API returned not-ok' };
        }
        return { ok: true, output: { channel, ts: res.ts } };
      } catch (err) {
        throw new ToolError('slack.send_message', 'EXECUTION_FAILED', `Slack post failed: ${(err as Error).message}`, { cause: err });
      }
    },
  };
}
