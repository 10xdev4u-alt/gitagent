/**
 * `gitagent validate` — validate all manifests in the repo.
 */

import path from 'node:path';
import { ManifestRegistry } from '../manifest/index.js';

export async function validateCommand(targetPath?: string): Promise<void> {
  try {
    const repoRoot = targetPath ? path.resolve(targetPath) : process.cwd();
    const registry = await ManifestRegistry.load({ repoRoot });
    const summary = registry.summary();
    if (summary.length === 0) {
      console.log('No agent manifests found.');
      console.log(`  Expected in: ${path.join(repoRoot, '.github/agents')}`);
      console.log(`  Run: gitagent init`);
      return;
    }
    console.log(`✓ Found ${summary.length} manifest${summary.length === 1 ? '' : 's'}:\n`);
    for (const m of summary) {
      console.log(`  ${m.name}`);
      console.log(`    path: ${m.path}`);
      console.log(`    triggers: ${m.triggers.join(', ')}`);
    }
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  }
}
