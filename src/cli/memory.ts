/**
 * `gitagent memory` — inspect an agent's memory.
 *
 * Subcommands:
 *   list <agent>      List all memory entries for an agent
 *   read <agent> <key>  Read a specific entry
 *   search <agent> <query>  Semantic search an agent's memory
 *   delete <agent> <key>   Delete a memory entry
 */

import { GitMemory, InMemoryStore, SemanticMemory } from '../memory/index.js';
import { ManifestRegistry } from '../manifest/index.js';
import { EpisodicMemory } from '../memory/episodic.js';

export interface MemoryCommand {
  agent: string;
  subcommand: 'list' | 'read' | 'search' | 'delete';
  key?: string;
  query?: string;
  prefix?: string;
  repoRoot: string;
}

export async function memoryCommand(cmd: MemoryCommand): Promise<void> {
  const registry = await ManifestRegistry.load({ repoRoot: cmd.repoRoot });
  const manifest = registry.get(cmd.agent);
  if (!manifest) {
    console.error(`No agent named "${cmd.agent}"`);
    process.exit(1);
  }
  const memCfg = manifest.frontmatter.memory;
  const memPath = `${cmd.repoRoot}/.github/agents/${cmd.agent}/${memCfg.path}`;
  const base = memCfg.type === 'in-memory' ? new InMemoryStore() : new GitMemory({ path: memPath });
  const mem = memCfg.semantic ? new SemanticMemory({ base }) : base;

  switch (cmd.subcommand) {
    case 'list': {
      const entries = await mem.list(cmd.prefix);
      if (entries.length === 0) {
        console.log('(empty)');
        return;
      }
      for (const e of entries) {
        const preview = e.content.replace(/\n/g, ' ').slice(0, 80);
        console.log(`${e.key}  ${preview}${e.content.length > 80 ? '...' : ''}`);
      }
      break;
    }
    case 'read': {
      if (!cmd.key) {
        console.error('Usage: gitagent memory read <agent> <key>');
        process.exit(1);
      }
      const e = await mem.read(cmd.key);
      if (!e) {
        console.error(`Key "${cmd.key}" not found`);
        process.exit(1);
      }
      console.log(e.content);
      break;
    }
    case 'search': {
      if (!cmd.query) {
        console.error('Usage: gitagent memory search <agent> <query>');
        process.exit(1);
      }
      if (!(mem instanceof SemanticMemory)) {
        console.error('Semantic search requires `semantic: true` in the agent\'s memory config');
        process.exit(1);
      }
      const results = await mem.search(cmd.query, { limit: 10 });
      if (results.length === 0) {
        console.log('(no matches)');
        return;
      }
      for (const r of results) {
        const preview = r.content.replace(/\n/g, ' ').slice(0, 80);
        console.log(`${r.key}  [${r.score.toFixed(3)}]  ${preview}${r.content.length > 80 ? '...' : ''}`);
      }
      break;
    }
    case 'delete': {
      if (!cmd.key) {
        console.error('Usage: gitagent memory delete <agent> <key>');
        process.exit(1);
      }
      const ok = await mem.delete(cmd.key);
      console.log(ok ? 'deleted' : 'not found');
      break;
    }
  }
}

/** Helper for the episodes subcommand. */
export async function episodesCommand(agent: string, repoRoot: string, limit = 20): Promise<void> {
  const registry = await ManifestRegistry.load({ repoRoot });
  const manifest = registry.get(agent);
  if (!manifest) {
    console.error(`No agent named "${agent}"`);
    process.exit(1);
  }
  const memCfg = manifest.frontmatter.memory;
  const memPath = `${repoRoot}/.github/agents/${agent}/${memCfg.path}`;
  const base = memCfg.type === 'in-memory' ? new InMemoryStore() : new GitMemory({ path: memPath });
  const ep = new EpisodicMemory(base);
  const recent = await ep.recent(limit);
  if (recent.length === 0) {
    console.log('(no episodes)');
    return;
  }
  for (const e of recent) {
    console.log(`${new Date(e.timestamp).toISOString()}  ${e.event}  ${e.title}`);
    console.log(`  decision: ${e.decision}`);
  }
}
