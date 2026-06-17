/**
 * Example custom memory backend: an in-memory + sqlite hybrid.
 *
 * Stores the working set in memory for fast access. Persists to
 * SQLite for durability. On read, checks memory first, then falls
 * back to SQLite.
 *
 * Useful for agents that need both speed and durability.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { InMemoryStore } from '../in-memory.js';
import { SqliteMemory } from '../sqlite.js';
import type { Memory, MemoryEntry, MemoryWriteOptions } from '../types.js';

export interface HybridMemoryOptions {
  /** Path to the SQLite file for persistence. */
  sqlitePath: string;
  /** Whether to write through to SQLite on every write (default true). */
  writeThrough?: boolean;
}

/**
 * A memory implementation that combines in-memory speed with
 * SQLite durability. Reads check memory first, then fall back to
 * SQLite. Writes go to both (unless writeThrough is false).
 */
export class HybridMemory implements Memory {
  private readonly memory = new InMemoryStore();
  private readonly sqlite: SqliteMemory | null = null;
  private readonly writeThrough: boolean;

  private constructor(sqlite: SqliteMemory | null, writeThrough: boolean) {
    this.sqlite = sqlite;
    this.writeThrough = writeThrough;
  }

  static async open(options: HybridMemoryOptions): Promise<HybridMemory> {
    const dir = path.dirname(options.sqlitePath);
    await fs.mkdir(dir, { recursive: true });
    const sqlite = await SqliteMemory.open({ path: options.sqlitePath });
    return new HybridMemory(sqlite, options.writeThrough ?? true);
  }

  async read(key: string): Promise<MemoryEntry | undefined> {
    const fromMem = await this.memory.read(key);
    if (fromMem) return fromMem;
    if (!this.sqlite) return undefined;
    const fromSqlite = await this.sqlite.read(key);
    if (fromSqlite) {
      // Hydrate the in-memory cache
      await this.memory.write(key, fromSqlite.content, { metadata: fromSqlite.metadata });
    }
    return fromSqlite;
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
    const entry = await this.memory.write(key, content, options);
    if (this.writeThrough && this.sqlite) {
      await this.sqlite.write(key, content, options);
    }
    return entry;
  }

  async list(prefix?: string): Promise<MemoryEntry[]> {
    if (!this.sqlite) return this.memory.list(prefix);
    // Prefer SQLite for the canonical view, since it persists
    return this.sqlite.list(prefix);
  }

  async delete(key: string): Promise<boolean> {
    const fromMem = await this.memory.delete(key);
    const fromSqlite = this.sqlite ? await this.sqlite.delete(key) : false;
    return fromMem || fromSqlite;
  }

  async count(): Promise<number> {
    if (!this.sqlite) return this.memory.count();
    return this.sqlite.count();
  }

  async close(): Promise<void> {
    if (this.sqlite) await this.sqlite.close();
    await this.memory.close();
  }
}
