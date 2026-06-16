/**
 * The gitagent HTTP server.
 *
 * Receives GitHub webhooks, finds the agent(s) subscribed to each event,
 * runs them, and posts back the results.
 *
 * Endpoints:
 *   POST /webhook   - main webhook receiver (signature-verified)
 *   GET  /health    - health check
 *   GET  /agents    - list all registered agents
 *   POST /run/:name - manually trigger an agent by name (operator endpoint)
 */

import { Hono, type Context } from 'hono';
import { ManifestRegistry, matchManifests, normalizeEvent, type Manifest } from '../manifest/index.js';
import { ProviderRegistry } from '../providers/registry.js';
import { createDefaultToolRegistry, defaultTools, type GitHubClientOptions } from '../tools/index.js';
import { GitMemory, InMemoryStore, type Memory, type SearchableMemory } from '../memory/index.js';
import { runAgent, type RunContext, type RunResult } from '../runtime/index.js';
import { normalizeWebhook, type NormalizedEvent } from './normalize.js';
import { verifyWebhookSignature } from './webhook-signature.js';

export interface ServerOptions {
  /** Webhook secret (must match the GitHub App's secret). */
  webhookSecret: string;
  /** Default GitHub client options (token, etc.). */
  github: GitHubClientOptions;
  /** The manifest registry. */
  registry: ManifestRegistry;
  /** The provider registry. */
  providers: ProviderRegistry;
  /** Where agents look for their memory. Defaults to '.github/agents/<name>/memory'. */
  memoryBasePath?: string;
  /** Logger. */
  logger?: {
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

const defaultLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export function createApp(options: ServerOptions) {
  const logger = options.logger ?? defaultLogger;
  const memoryBasePath = options.memoryBasePath ?? '.github/agents';
  const app = new Hono();

  // Health check
  app.get('/health', (c) =>
    c.json({
      ok: true,
      agents: options.registry.size,
      time: new Date().toISOString(),
    }),
  );

  // List agents
  app.get('/agents', (c) => c.json({ agents: options.registry.summary() }));

  // Webhook receiver
  app.post('/webhook', async (c) => {
    const signature = c.req.header('x-hub-signature-256');
    const eventName = c.req.header('x-github-event') ?? 'unknown';
    const deliveryId = c.req.header('x-github-delivery') ?? 'unknown';
    const installationId = c.req.header('x-github-installation-id');
    const rawBody = await c.req.text();

    if (!verifyWebhookSignature(rawBody, signature, options.webhookSecret)) {
      logger.warn('webhook signature verification failed', { deliveryId, eventName });
      return c.json({ ok: false, error: 'Invalid signature' }, 401);
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return c.json({ ok: false, error: 'Invalid JSON' }, 400);
    }

    const repo = payload.repository as { owner: { login: string }; name: string } | undefined;
    if (!repo?.owner?.login || !repo?.name) {
      return c.json({ ok: false, error: 'Missing repository info' }, 400);
    }

    const event = normalizeWebhook(
      eventName,
      payload,
      deliveryId,
      installationId ? Number(installationId) : undefined,
    );

    const matches = matchManifests(
      options.registry.list(),
      (normalizeEvent(eventName, event.action) ?? eventName) as Parameters<typeof matchManifests>[1],
    );

    logger.info('webhook received', {
      event: event.name,
      action: event.action,
      delivery: deliveryId,
      repo: `${repo.owner.login}/${repo.name}`,
      matchedAgents: matches.map((m) => m.manifest.frontmatter.name),
    });

    // Run all matched agents in sequence
    const results: Array<{ agent: string; result: RunResult }> = [];
    for (const match of matches) {
      const result = await runAgentForManifest({
        manifest: match.manifest,
        event,
        repo: { owner: repo.owner.login, name: repo.name },
        registry: options.registry,
        providers: options.providers,
        github: options.github,
        memoryBasePath,
        logger,
      });
      results.push({ agent: match.manifest.frontmatter.name, result });
    }

    return c.json({ ok: true, matched: matches.length, results });
  });

  // Manual trigger
  app.post('/run/:name', async (c) => {
    const name = c.req.param('name');
    const manifest = options.registry.get(name);
    if (!manifest) return c.json({ ok: false, error: `No agent named "${name}"` }, 404);

    const body = (await c.req.json().catch(() => ({}))) as {
      payload?: unknown;
      action?: string;
      repo?: { owner: string; name: string };
    };

    const repo = body.repo ?? { owner: 'unknown', name: 'unknown' };
    const event: NormalizedEvent = {
      name: 'manual',
      ...(body.action ? { action: body.action } : {}),
      payload: body.payload ?? {},
      deliveryId: `manual-${Date.now()}`,
    };

    const result = await runAgentForManifest({
      manifest,
      event,
      repo,
      registry: options.registry,
      providers: options.providers,
      github: options.github,
      memoryBasePath,
      logger,
    });

    return c.json({ ok: true, agent: name, result });
  });

  return app;
}

interface RunAgentArgs {
  manifest: Manifest;
  event: NormalizedEvent;
  repo: { owner: string; name: string };
  registry: ManifestRegistry;
  providers: ProviderRegistry;
  github: GitHubClientOptions;
  memoryBasePath: string;
  logger: NonNullable<ServerOptions['logger']>;
}

async function runAgentForManifest(args: RunAgentArgs): Promise<RunResult> {
  const memory = buildMemory(args);
  const tools = createDefaultToolRegistry(args.github);

  const rc: RunContext = {
    manifest: args.manifest,
    event: args.event,
    provider: args.providers.forModel(args.manifest.frontmatter.model),
    tools,
    memory,
    repo: args.repo,
    runId: `${args.event.deliveryId}-${args.manifest.frontmatter.name}`,
    dryRun: false,
    logger: args.logger,
  };

  return runAgent(rc);
}

function buildMemory(args: RunAgentArgs): Memory | SearchableMemory {
  const memCfg = args.manifest.frontmatter.memory;
  if (memCfg.type === 'in-memory') {
    return new InMemoryStore();
  }
  // git or sqlite: use git-backed for now (sqlite is a future enhancement)
  return new GitMemory({
    path: `${args.memoryBasePath}/${args.manifest.frontmatter.name}/${memCfg.path}`,
  });
}

/** Convenience: start the server on the given port. */
export async function serve(options: ServerOptions, port = 3000): Promise<void> {
  const app = createApp(options);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const server = (app as any).serve({ port });
  await server;
}

/** Re-export the Context type for users extending the app. */
export type { Context };
