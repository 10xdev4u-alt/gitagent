/**
 * Semantic memory.
 *
 * Stores entries with an embedding so they can be retrieved by similarity.
 * The default implementation uses a TF-IDF-style bag-of-words embedding
 * (no external API) so it works out of the box. For higher quality, pass
 * an `embed` function (e.g. one that calls OpenAI's embeddings API).
 */

import type { Memory, SearchableMemory, MemoryEntry, MemoryWriteOptions } from './types.js';

export interface SemanticMemoryOptions {
  /** The underlying memory. */
  base: Memory;
  /** Embedding function. Defaults to bag-of-words. */
  embed?: (text: string) => Promise<number[]> | number[];
}

/** A simple FNV-1a hash for token -> bucket mapping. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** A simple bag-of-words embedder using a fixed 256-bucket hash space. */
function defaultEmbed(text: string): number[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const vec: number[] = new Array(256).fill(0);
  for (const t of tokens) {
    vec[fnv1a(t) % 256] += 1;
  }
  return vec;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class SemanticMemory implements SearchableMemory {
  private readonly base: Memory;
  private readonly embed: (text: string) => Promise<number[]> | number[];
  /** In-memory cache of embeddings: key -> vector. */
  private readonly cache: Map<string, number[]> = new Map();

  constructor(options: SemanticMemoryOptions) {
    this.base = options.base;
    this.embed = options.embed ?? defaultEmbed;
  }

  async read(key: string): Promise<MemoryEntry | undefined> {
    return this.base.read(key);
  }

  async write(key: string, content: string, options: MemoryWriteOptions = {}): Promise<MemoryEntry> {
    const entry = await this.base.write(key, content, options);
    if (!options.dryRun) {
      this.cache.set(key, await this.embed(content));
    }
    return entry;
  }

  async list(prefix?: string): Promise<MemoryEntry[]> {
    return this.base.list(prefix);
  }

  async delete(key: string): Promise<boolean> {
    this.cache.delete(key);
    return this.base.delete(key);
  }

  async count(): Promise<number> {
    return this.base.count();
  }

  async close(): Promise<void> {
    this.cache.clear();
    return this.base.close();
  }

  async search(
    query: string,
    options: { limit?: number; minScore?: number } = {},
  ): Promise<Array<MemoryEntry & { score: number }>> {
    const limit = options.limit ?? 10;
    const minScore = options.minScore ?? 0.0;
    const qVec = await this.embed(query);

    const all = await this.base.list();
    const results: Array<MemoryEntry & { score: number }> = [];
    for (const entry of all) {
      let vec = this.cache.get(entry.key);
      if (!vec) {
        vec = await this.embed(entry.content);
        this.cache.set(entry.key, vec);
      }
      const score = cosine(qVec, vec);
      if (score >= minScore) {
        results.push({ ...entry, score });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}
