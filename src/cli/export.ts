/**
 * `gitagent export` — export a run's events to a portable format.
 *
 * Useful for migrating between observability backends, sharing runs
 * for debugging, or archiving important runs.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ManifestRegistry, type Manifest } from '../manifest/index.js';
import { ProviderRegistry } from '../providers/registry.js';
import { GitMemory, InMemoryStore, type Memory } from '../memory/index.js';
import { createDefaultToolRegistry } from '../tools/defaults.js';
import { runAgent, type RunContext, type RunResult } from '../runtime/index.js';
import { ObserverBus, type RuntimeEvent } from '../runtime/observability.js';

export interface ExportOptions {
  agent: string;
  event: string;
  payload?: unknown;
  action?: string;
  repo: { owner: string; name: string };
  output: string;
  repoRoot: string;
}

/** Run an agent and export the events to a file as JSONL. */
export async function exportCommand(options: ExportOptions): Promise<void> {
  const registry = await ManifestRegistry.load({ repoRoot: options.repoRoot });
  const manifest = registry.get(options.agent);
  if (!manifest) {
    console.error(`Agent "${options.agent}" not found`);
    process.exit(1);
  }

  const events: RuntimeEvent[] = [];
  const bus = new ObserverBus();
  bus.add((event) => events.push(event));

  const providers = ProviderRegistry.withDefaults();
  const provider = providers.forModel(manifest.frontmatter.model);
  const memory: Memory = manifest.frontmatter.memory.type === 'in-memory'
    ? new InMemoryStore()
    : new GitMemory({ path: path.join(options.repoRoot, '.github/agents', options.agent, manifest.frontmatter.memory.path) });

  const rc: RunContext = {
    manifest,
    event: {
      name: options.event,
      ...(options.action ? { action: options.action } : {}),
      payload: options.payload ?? {},
    },
    provider,
    tools: createDefaultToolRegistry({ token: 'export-token' }),
    memory,
    repo: options.repo,
    runId: `export-${Date.now()}`,
    dryRun: true,
    logger: {
      debug: () => {},
      info: (msg: string) => console.error(`[info] ${msg}`),
      warn: (msg: string) => console.error(`[warn] ${msg}`),
      error: (msg: string) => console.error(`[error] ${msg}`),
    },
  };

  console.log(`Running agent ${options.agent} and capturing events...`);
  await runAgent(rc, { observers: bus });

  // Write events to the output file
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  const lines = events.map((e) => JSON.stringify(e)).join('\n');
  await fs.writeFile(options.output, lines + '\n', 'utf8');
  console.log(`✓ Exported ${events.length} events to ${options.output}`);
}
