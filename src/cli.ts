#!/usr/bin/env node
/**
 * gitagent CLI.
 *
 * Subcommands:
 *   init [name]   Scaffold a new agent manifest in .github/agents/
 *   validate      Validate all manifests in the repo
 *   dev           Run the agent runner against a local fixture event
 *   serve         Start the webhook server
 *   list          List all registered agents
 *   logs          Show recent agent run logs
 *   memory        Inspect an agent's memory
 *   config        Show resolved config
 */

import { Command } from 'commander';
import { initCommand } from './cli/init.js';
import { validateCommand } from './cli/validate.js';
import { devCommand } from './cli/dev.js';
import { serveCommand } from './cli/serve.js';
import { listCommand } from './cli/list.js';
import { configCommand } from './cli/config.js';
import { memoryCommand, episodesCommand } from './cli/memory.js';
import { logsCommand } from './cli/logs.js';
import { replayCommand } from './cli/replay.js';

const program = new Command();

program
  .name('gitagent')
  .description('Persistent, versioned AI agents that live in your GitHub repository')
  .version('0.1.0');

program
  .command('init [name]')
  .description('Scaffold a new agent manifest in .github/agents/')
  .option('-d, --description <text>', 'Agent description')
  .option('-t, --trigger <event...>', 'One or more GitHub events to trigger on')
  .option('-f, --force', 'Overwrite existing manifest', false)
  .action(initCommand);

program
  .command('validate [path]')
  .description('Validate all agent manifests in the repo (or a specific path)')
  .action(validateCommand);

program
  .command('dev')
  .description('Run an agent against a local fixture event (no server needed)')
  .option('-e, --event <event>', 'Event name (e.g. issues.opened)', 'issues.opened')
  .option('-a, --agent <name>', 'Agent name (defaults to first match for the event)')
  .option('-p, --payload <file>', 'Path to a JSON payload file')
  .option('-r, --repo <owner/name>', 'Repo context', 'me/r')
  .option('--dry-run', 'Do not execute any tools that have side effects', false)
  .action(devCommand);

program
  .command('serve')
  .description('Start the webhook server')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('-s, --secret <secret>', 'Webhook secret (or set GITAGENT_WEBHOOK_SECRET)')
  .option('--repo-root <path>', 'Path to the repo root', '.')
  .action(serveCommand);

program
  .command('list')
  .description('List all registered agents')
  .option('--repo-root <path>', 'Path to the repo root', '.')
  .action(listCommand);

program
  .command('config')
  .description('Show resolved configuration (env, defaults)')
  .action(configCommand);

program
  .command('memory <subcommand> <agent> [args...]')
  .description('Inspect an agent\'s memory (subcommands: list | read | search | delete | episodes)')
  .option('--prefix <prefix>', 'Filter list by key prefix', '')
  .option('--repo-root <path>', 'Path to the repo root', '.')
  .action(async (subcommand: string, agent: string, args: string[], options: { prefix?: string; repoRoot: string }) => {
    if (subcommand === 'episodes') {
      await episodesCommand(agent, options.repoRoot);
      return;
    }
    if (!['list', 'read', 'search', 'delete'].includes(subcommand)) {
      console.error(`Unknown memory subcommand: ${subcommand}`);
      process.exit(1);
    }
    await memoryCommand({
      agent,
      subcommand: subcommand as 'list' | 'read' | 'search' | 'delete',
      ...(args[0] !== undefined ? { key: args[0] } : {}),
      ...(args[0] !== undefined && subcommand === 'search' ? { query: args[0] } : {}),
      ...(options.prefix !== undefined ? { prefix: options.prefix } : {}),
      repoRoot: options.repoRoot,
    });
  });

program
  .command('logs <agent>')
  .description('Show recent runs for an agent')
  .option('-n, --limit <n>', 'Max runs to show', '20')
  .option('--repo-root <path>', 'Path to the repo root', '.')
  .action(async (agent: string, options: { limit: string; repoRoot: string }) => {
    await logsCommand({ agent, repoRoot: options.repoRoot, limit: Number.parseInt(options.limit, 10) });
  });

program
  .command('replay <logPath>')
  .description('Replay a past agent run from a JSONL log file')
  .option('--repo-root <path>', 'Path to the repo root', '.')
  .option('--dry-run', 'Do not execute any tools that have side effects', false)
  .option('--provider <name>', 'Override the LLM provider for the replay')
  .action(async (logPath: string, options: { repoRoot: string; dryRun: boolean; provider?: string }) => {
    await replayCommand({
      logPath,
      repoRoot: options.repoRoot,
      dryRun: options.dryRun,
      ...(options.provider ? { providerOverride: options.provider } : {}),
    });
  });

program
  .command('run <agent>')
  .description('Manually trigger an agent (alias for the /run HTTP endpoint)')
  .option('-p, --payload <file>', 'Path to a JSON payload file')
  .option('-a, --action <action>', 'Action name (e.g. "opened")')
  .option('-r, --repo <owner/name>', 'Repo context', 'me/r')
  .option('--dry-run', 'Do not execute any tools that have side effects', false)
  .action(async (agent: string, options: { payload?: string; action?: string; repo: string; dryRun: boolean }) => {
    await devCommand({ event: 'manual', agent, payload: options.payload, repo: options.repo, dryRun: options.dryRun, ...(options.action ? { action: options.action } : {}) });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
