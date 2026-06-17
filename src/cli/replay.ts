/**
 * `gitagent replay` — replay a past agent run from a JSONL log.
 *
 * Each run is recorded as a sequence of events. The replay command
 * reads the log, reconstructs the inputs, and re-executes the agent
 * with the same (or modified) parameters.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ManifestRegistry, type Manifest } from '../manifest/index.js';
import { ProviderRegistry } from '../providers/registry.js';
import { GitMemory, InMemoryStore, type Memory } from '../memory/index.js';
import { createDefaultToolRegistry } from '../tools/defaults.js';
import { runAgent, type RunContext, type RunResult } from '../runtime/index.js';

export interface ReplayOptions {
  logPath: string;
  repoRoot: string;
  dryRun: boolean;
  /** Optional: override the LLM provider (for replaying with a different model). */
  providerOverride?: string;
}

interface LogEntry {
  ts: string;
  type: 'run_start' | 'run_end' | 'step' | 'tool_call' | 'message';
  data: Record<string, unknown>;
}

export async function replayCommand(options: ReplayOptions): Promise<void> {
  // Read the log
  const raw = await fs.readFile(options.logPath, 'utf8');
  const lines = raw.trim().split('\n');
  const entries: LogEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }

  // Find the run_start and run_end
  const start = entries.find((e) => e.type === 'run_start');
  const end = entries.find((e) => e.type === 'run_end');
  if (!start) {
    console.error('No run_start found in log');
    process.exit(1);
  }

  console.log(`Replaying run from ${start.ts}`);
  if (end) {
    console.log(`  Original end: ${end.ts}`);
  }

  // Load the manifest
  const registry = await ManifestRegistry.load({ repoRoot: options.repoRoot });
  const agentName = (start.data.agent as string) ?? '';
  const manifest = registry.get(agentName);
  if (!manifest) {
    console.error(`Agent "${agentName}" not found in registry`);
    process.exit(1);
  }

  // Build the run context
  const providers = ProviderRegistry.withDefaults();
  const provider = options.providerOverride
    ? providers.get(options.providerOverride) ?? providers.forModel(manifest.frontmatter.model)
    : providers.forModel(manifest.frontmatter.model);

  const memory = buildMemory(manifest, options.repoRoot);
  const tools = createDefaultToolRegistry({ token: 'replay-token' });

  const rc: RunContext = {
    manifest,
    event: {
      name: (start.data.event as string) ?? 'manual',
      payload: start.data.payload,
    },
    provider,
    tools,
    memory,
    repo: (start.data.repo as { owner: string; name: string }) ?? { owner: 'unknown', name: 'unknown' },
    runId: `replay-${Date.now()}`,
    dryRun: options.dryRun,
    logger: {
      debug: () => {},
      info: (msg: string) => console.error(`[info] ${msg}`),
      warn: (msg: string) => console.error(`[warn] ${msg}`),
      error: (msg: string) => console.error(`[error] ${msg}`),
    },
  };

  console.log('Running agent...');
  const result = await runAgent(rc);
  console.log(JSON.stringify(result, null, 2));
}

function buildMemory(manifest: Manifest, repoRoot: string): Memory {
  const memCfg = manifest.frontmatter.memory;
  if (memCfg.type === 'in-memory') {
    return new InMemoryStore();
  }
  return new GitMemory({
    path: path.join(repoRoot, '.github/agents', manifest.frontmatter.name, memCfg.path),
  });
}

/** Helper: write a log entry to a file. Used by the runtime when persistence is on. */
export async function appendLogEntry(logPath: string, entry: LogEntry): Promise<void> {
  const line = JSON.stringify(entry) + '\n';
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, line, 'utf8');
}
