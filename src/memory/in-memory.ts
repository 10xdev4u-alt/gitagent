/**
 * In-memory memory implementation.
 *
 * Useful for tests and for ephemeral agent runs that don't need persistence.
 */

import type { Memory, MemoryEntry, MemoryWriteOptions } from './types.js';

export class InMemoryStore implements Memory {
  private readonly entries: Map<string, MemoryEntry> = new Map();

  async read(key: string): Promise<MemoryEntry | undefined> {
    return this.entries.get(key);
  }

  async write(key: string, content: string, options: MemoryWriteOptions = {}): Promise<MemoryEntry> {
    if (options.dryRun) {
      return {
        key,
        content,
        metadata: options.metadata,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
    const now = Date.now();
    const existing = this.entries.get(key);
    const entry: MemoryEntry = {
      key,
      content,
      metadata: options.metadata,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.entries.set(key, entry);
    return entry;
  }

  async list(prefix?: string): Promise<MemoryEntry[]> {
    const all = Array.from(this.entries.values());
    if (!prefix) return all;
    return all.filter((e) => e.key.startsWith(prefix));
  }

  async delete(key: string): Promise<boolean> {
    return this.entries.delete(key);
  }

  async count(): Promise<number> {
    return this.entries.size;
  }

  async close(): Promise<void> {
    this.entries.clear();
  }
}
