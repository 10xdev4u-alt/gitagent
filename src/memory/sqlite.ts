/**
 * SQLite-backed memory.
 *
 * Uses better-sqlite3 (Node.js only) for a persistent, indexed memory
 * store. Entries are serialized to JSON in a TEXT column.
 *
 * Note: this backend requires better-sqlite3 to be installed. It is
 * an optional peer dependency. If missing, the constructor throws a
 * helpful error.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Memory, MemoryEntry, MemoryWriteOptions } from './types.js';

export interface SqliteMemoryOptions {
  /** Path to the SQLite file. Parent directory will be created. */
  path: string;
}

/** Cached Database type. */
type Database = unknown;

let cachedDatabase: Database = null;
let cachedBetterSqlite3: typeof import('better-sqlite3') | null = null;

async function loadBetterSqlite3(): Promise<typeof import('better-sqlite3')> {
  if (cachedBetterSqlite3) return cachedBetterSqlite3;
  try {
    cachedBetterSqlite3 = (await import('better-sqlite3')) as unknown as typeof import('better-sqlite3');
    return cachedBetterSqlite3;
  } catch (err) {
    throw new Error(
      'better-sqlite3 is not installed. Run `npm install better-sqlite3` to use SqliteMemory.',
    );
  }
}

export class SqliteMemory implements Memory {
  private readonly db: unknown;
  private readonly path: string;

  private constructor(db: unknown, path: string) {
    this.db = db;
    this.path = path;
  }

  /** Open or create a SQLite memory file. */
  static async open(options: SqliteMemoryOptions): Promise<SqliteMemory> {
    const dir = path.dirname(options.path);
    await fs.mkdir(dir, { recursive: true });
    const better = await loadBetterSqlite3();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = new (better as any)(options.path);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyDb = db as any;
    anyDb.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        key TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_updated_at ON memory(updated_at DESC);
    `);
    if (!cachedDatabase) cachedDatabase = db;
    return new SqliteMemory(db, options.path);
  }

  async read(key: string): Promise<MemoryEntry | undefined> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (this.db as any).prepare('SELECT * FROM memory WHERE key = ?').get(key) as
      | { key: string; content: string; metadata: string | null; created_at: number; updated_at: number }
      | undefined;
    if (!row) return undefined;
    return {
      key: row.key,
      content: row.content,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
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
    const existing = await this.read(key);
    const createdAt = existing?.createdAt ?? now;
    const metadataJson = options.metadata ? JSON.stringify(options.metadata) : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.db as any)
      .prepare(
        `INSERT INTO memory (key, content, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           content = excluded.content,
           metadata = excluded.metadata,
           updated_at = excluded.updated_at`,
      )
      .run(key, content, metadataJson, createdAt, now);
    return { key, content, metadata: options.metadata, createdAt, updatedAt: now };
  }

  async list(prefix = ''): Promise<MemoryEntry[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (this.db as any)
      .prepare(
        prefix
          ? 'SELECT * FROM memory WHERE key LIKE ? ORDER BY updated_at DESC'
          : 'SELECT * FROM memory ORDER BY updated_at DESC',
      )
      .all(prefix ? `${prefix}%` : undefined) as Array<{
      key: string;
      content: string;
      metadata: string | null;
      created_at: number;
      updated_at: number;
    }>;
    return rows.map((row) => ({
      key: row.key,
      content: row.content,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async delete(key: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (this.db as any).prepare('DELETE FROM memory WHERE key = ?').run(key);
    return result.changes > 0;
  }

  async count(): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (this.db as any).prepare('SELECT COUNT(*) as c FROM memory').get() as { c: number };
    return row.c;
  }

  async close(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.db as any).close();
  }
}
