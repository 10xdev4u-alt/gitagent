/**
 * Git-backed memory.
 *
 * Stores each entry as a file in the repo under
 * `.github/agents/<agent>/memory/<key>`. Writes are committed to git so
 * the memory's history is part of the repo's history.
 *
 * Note: this implementation only writes files; the actual `git add` and
 * `git commit` are done by the agent runtime (so the commit author can be
 * the GitHub App installation). This module just handles the file I/O.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Memory, MemoryEntry, MemoryWriteOptions } from './types.js';

export interface GitMemoryOptions {
  /** Path to the memory directory (will be created if missing). */
  path: string;
  /** Max file size in bytes (default 1MB). Larger entries throw. */
  maxFileSize?: number;
  /** Whether to JSON-encode entries (default true). Set false for raw text. */
  encode?: boolean;
}

/** On-disk format. */
interface SerializedEntry {
  key: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class GitMemory implements Memory {
  private readonly basePath: string;
  private readonly maxFileSize: number;
  private readonly encode: boolean;

  constructor(options: GitMemoryOptions) {
    this.basePath = path.resolve(options.path);
    this.maxFileSize = options.maxFileSize ?? 1024 * 1024;
    this.encode = options.encode ?? true;
  }

  private entryPath(key: string): string {
    // Sanitize: no path traversal, no leading slashes
    const safe = key.replace(/^\/+/, '').replace(/\.\.+/g, '_');
    return path.join(this.basePath, safe);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  async read(key: string): Promise<MemoryEntry | undefined> {
    const filePath = this.entryPath(key);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw err;
    }
    if (!this.encode) {
      return {
        key,
        content: raw,
        createdAt: 0,
        updatedAt: 0,
      };
    }
    try {
      const parsed = JSON.parse(raw) as SerializedEntry;
      return {
        key: parsed.key,
        content: parsed.content,
        metadata: parsed.metadata,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
      };
    } catch {
      return {
        key,
        content: raw,
        createdAt: 0,
        updatedAt: 0,
      };
    }
  }

  async write(key: string, content: string, options: MemoryWriteOptions = {}): Promise<MemoryEntry> {
    if (content.length > this.maxFileSize) {
      throw new Error(`Memory entry "${key}" exceeds max size ${this.maxFileSize} bytes`);
    }
    if (options.dryRun) {
      return {
        key,
        content,
        metadata: options.metadata,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
    await this.ensureDir();
    const existing = await this.read(key);
    const now = Date.now();
    const entry: MemoryEntry = {
      key,
      content,
      metadata: options.metadata,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const filePath = this.entryPath(key);
    const data = this.encode
      ? JSON.stringify({ ...entry }, null, 2)
      : content;
    await fs.writeFile(filePath, data, 'utf8');
    return entry;
  }

  async list(prefix = ''): Promise<MemoryEntry[]> {
    try {
      await fs.access(this.basePath);
    } catch {
      return [];
    }
    const out: MemoryEntry[] = [];
    await this.walk(this.basePath, prefix, out);
    return out;
  }

  private async walk(dir: string, prefix: string, out: MemoryEntry[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(full, prefix, out);
      } else if (entry.isFile()) {
        const relKey = path.relative(this.basePath, full);
        if (!prefix || relKey.startsWith(prefix)) {
          const e = await this.read(relKey);
          if (e) out.push(e);
        }
      }
    }
  }

  async delete(key: string): Promise<boolean> {
    const filePath = this.entryPath(key);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
  }

  async count(): Promise<number> {
    const all = await this.list();
    return all.length;
  }

  async close(): Promise<void> {
    // No resources to release; memory is file-backed.
  }

  /** The base path of this memory. */
  get path(): string {
    return this.basePath;
  }
}
