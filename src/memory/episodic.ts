/**
 * Episodic memory.
 *
 * An append-only log of past events, decisions, and observations. Each
 * episode is a timestamped entry that the agent can recall later to
 * inform future decisions.
 *
 * Episodes are stored in the underlying memory under the `episodes/`
 * prefix with a sortable key (ISO timestamp + slug).
 */

import type { Memory } from './types.js';
import type { GitHubEvent } from '../manifest/schema.js';

export interface Episode {
  /** When the episode happened (ms since epoch). */
  timestamp: number;
  /** What triggered it. */
  event: GitHubEvent | 'manual';
  /** Short, human-readable title. */
  title: string;
  /** What the agent decided or did. */
  decision: string;
  /** Optional context (issue number, PR number, etc.). */
  context?: Record<string, unknown>;
  /** Optional outcome (what happened next time). */
  outcome?: string;
}

export class EpisodicMemory {
  constructor(
    private readonly memory: Memory,
    private readonly prefix = 'episodes/',
  ) {}

  /** Record a new episode. */
  async record(episode: Omit<Episode, 'timestamp'> & { timestamp?: number }): Promise<string> {
    const ts = episode.timestamp ?? Date.now();
    const slug = slugify(episode.title);
    const key = `${this.prefix}${ts}-${slug}`;
    const full: Episode = { ...episode, timestamp: ts };
    await this.memory.write(key, JSON.stringify(full, null, 2));
    return key;
  }

  /** List recent episodes, most recent first. */
  async recent(limit = 20): Promise<Array<Episode & { key: string }>> {
    const all = await this.memory.list(this.prefix);
    const parsed = all
      .map((e) => {
        try {
          return { ...(JSON.parse(e.content) as Episode), key: e.key };
        } catch {
          return null;
        }
      })
      .filter((e): e is Episode & { key: string } => e !== null);
    parsed.sort((a, b) => {
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
      // Tiebreaker: more recent key first (keys are `${ts}-${slug}`, so desc lex = most recent)
      return b.key.localeCompare(a.key);
    });
    return parsed.slice(0, limit);
  }

  /** Get episodes that match a context key (e.g. issue number). */
  async forContext(contextKey: string, contextValue: unknown, limit = 20): Promise<Array<Episode & { key: string }>> {
    const all = await this.recent(1000);
    return all.filter((e) => e.context?.[contextKey] === contextValue).slice(0, limit);
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64);
}
