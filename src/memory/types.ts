/**
 * The memory interface.
 *
 * A memory is a key-value store with two extra capabilities:
 *   - search(query): find semantically related entries (optional, may throw)
 *   - list(prefix): list all entries under a prefix
 *
 * Implementations:
 *   - {@link GitMemory}: stores entries as files in the repo, commits each write
 *   - {@link InMemoryStore}: in-process, for tests
 *   - {@link SqliteMemory}: persistent, single-file SQLite
 */

/** A single memory entry. */
export interface MemoryEntry {
  /** Unique key (e.g. "episodes/2026-01-15-issue-42"). */
  key: string;
  /** The content (string). */
  content: string;
  /** Optional metadata (labels, tags, etc.). */
  metadata?: Record<string, unknown>;
  /** Timestamp (ms since epoch). */
  createdAt: number;
  /** Timestamp of last update. */
  updatedAt: number;
}

/** Options for write operations. */
export interface MemoryWriteOptions {
  metadata?: Record<string, unknown>;
  /** If true, do not actually persist (used for dry-run). */
  dryRun?: boolean;
}

export interface Memory {
  /** Read an entry by key. Returns undefined if not found. */
  read(key: string): Promise<MemoryEntry | undefined>;
  /** Write an entry. Creates or overwrites. */
  write(key: string, content: string, options?: MemoryWriteOptions): Promise<MemoryEntry>;
  /** List all entries under a prefix. */
  list(prefix?: string): Promise<MemoryEntry[]>;
  /** Delete an entry. Returns true if it existed. */
  delete(key: string): Promise<boolean>;
  /** Total number of entries. */
  count(): Promise<number>;
  /** Close/cleanup. */
  close(): Promise<void>;
}

/** Extended memory interface with semantic search. */
export interface SearchableMemory extends Memory {
  /** Search for entries semantically similar to the query. */
  search(query: string, options?: { limit?: number; minScore?: number }): Promise<Array<MemoryEntry & { score: number }>>;
}
