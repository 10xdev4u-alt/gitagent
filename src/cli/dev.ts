/**
 * `gitagent dev` — run an agent against a local fixture event.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ManifestRegistry, matchManifests, normalizeEvent } from '../manifest/index.js';
import { ProviderRegistry } from '../providers/registry.js';
import { InMemoryStore } from '../memory/in-memory.js';
import { createDefaultToolRegistry } from '../tools/defaults.js';
import { runAgent, type RunContext } from '../runtime/index.js';
import type { GitHubEvent } from '../manifest/schema.js';

export interface DevOptions {
  event: string;
  agent?: string;
  payload?: string;
  repo: string;
  dryRun?: boolean;
}

const mockProvider = {
  name: 'mock',
  defaultModel: 'mock-1',
  chat: async () => ({
    content: '[gitagent dev] LLM calls are not supported in dev mode. Use --provider <name> and set an API key.',
    toolCalls: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    model: 'mock',
    stopReason: 'end_turn',
  }),
};

export async function devCommand(options: DevOptions): Promise<void> {
  const [owner, name] = options.repo.split('/');
  if (!owner || !name) {
    console.error('Error: --repo must be in the form owner/name');
    process.exit(1);
  }

  const registry = await ManifestRegistry.load({ repoRoot: process.cwd() });
  if (registry.size === 0) {
    console.error('No manifests found. Run: gitagent init');
    process.exit(1);
  }

  const eventName = normalizeEvent(...options.event.split('.', 2) as [string, string?]) as GitHubEvent;
  let manifests = registry.listForEvent(eventName);
  if (options.agent) {
    manifests = registry.list().filter((m) => m.frontmatter.name === options.agent);
  }
  const matches = matchManifests(manifests, eventName);
  if (matches.length === 0) {
    console.error(`No agent matches event "${options.event}"`);
    process.exit(1);
  }
  const manifest = matches[0]!.manifest;

  let payload: unknown = {};
  if (options.payload) {
    const raw = await fs.readFile(path.resolve(options.payload), 'utf8');
    payload = JSON.parse(raw);
  }

  const providers = ProviderRegistry.withDefaults();
  providers.register('anthropic', mockProvider);
  providers.register('openai', mockProvider);
  providers.register('openai-compatible', mockProvider);

  const rc: RunContext = {
    manifest,
    event: { name: eventName, payload },
    provider: providers.forModel(manifest.frontmatter.model),
    tools: createDefaultToolRegistry({ token: 'fake' }),
    memory: new InMemoryStore(),
    repo: { owner, name },
    runId: `dev-${Date.now()}`,
    dryRun: options.dryRun ?? false,
    logger: {
      debug: (msg: string) => console.error(`[debug] ${msg}`),
      info: (msg: string) => console.error(`[info] ${msg}`),
      warn: (msg: string) => console.error(`[warn] ${msg}`),
      error: (msg: string) => console.error(`[error] ${msg}`),
    },
  };

  const result = await runAgent(rc);
  console.log(JSON.stringify(result, null, 2));
}
