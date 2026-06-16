/**
 * `gitagent list` — list registered agents.
 */

import { ManifestRegistry } from '../manifest/index.js';

export interface ListOptions {
  repoRoot: string;
}

export async function listCommand(options: ListOptions): Promise<void> {
  const registry = await ManifestRegistry.load({ repoRoot: options.repoRoot });
  if (registry.size === 0) {
    console.log('No agents registered.');
    return;
  }
  console.log(`Agents (${registry.size}):\n`);
  for (const m of registry.list()) {
    console.log(`  ${m.frontmatter.name}`);
    if (m.frontmatter.description) console.log(`    ${m.frontmatter.description}`);
    console.log(`    triggers: ${m.frontmatter.triggers.join(', ')}`);
    console.log(`    model: ${m.frontmatter.model.provider}/${m.frontmatter.model.name}`);
    console.log(`    tools: ${m.frontmatter.tools.length === 0 ? '(none)' : m.frontmatter.tools.join(', ')}`);
    console.log('');
  }
}
