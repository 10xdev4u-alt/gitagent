/**
 * `gitagent serve` — start the webhook server.
 */

import path from 'node:path';
import { ManifestRegistry } from '../manifest/index.js';
import { ProviderRegistry } from '../providers/registry.js';
import { createApp } from '../server/app.js';

export interface ServeOptions {
  port: string;
  secret?: string;
  repoRoot: string;
}

export async function serveCommand(options: ServeOptions): Promise<void> {
  const secret = options.secret ?? process.env.GITAGENT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('Error: webhook secret required. Set GITAGENT_WEBHOOK_SECRET or pass --secret.');
    process.exit(1);
  }
  const repoRoot = path.resolve(options.repoRoot);
  const registry = await ManifestRegistry.load({ repoRoot });
  const providers = ProviderRegistry.withDefaults();
  const app = createApp({
    webhookSecret: secret,
    github: { token: process.env.GITHUB_TOKEN ?? '' },
    registry,
    providers,
    memoryBasePath: path.join(repoRoot, '.github', 'agents'),
  });
  const port = Number.parseInt(options.port, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const server = (app as any).serve({ port });
  await server;
  console.log(`gitagent server listening on http://localhost:${port}`);
  console.log(`  /health   — health check`);
  console.log(`  /agents   — list registered agents`);
  console.log(`  /webhook  — GitHub webhook receiver`);
  console.log(`  /run/:name — manually trigger an agent`);
}
