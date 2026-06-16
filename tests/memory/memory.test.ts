/**
 * Tests for the memory implementations.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryStore } from '../../src/memory/in-memory.js';
import { GitMemory } from '../../src/memory/git.js';
import { EpisodicMemory } from '../../src/memory/episodic.js';
import { SemanticMemory } from '../../src/memory/semantic.js';

describe('InMemoryStore', () => {
  it('writes and reads an entry', async () => {
    const m = new InMemoryStore();
    await m.write('foo', 'hello');
    const e = await m.read('foo');
    expect(e?.content).toBe('hello');
    expect(e?.createdAt).toBeGreaterThan(0);
  });

  it('returns undefined for missing keys', async () => {
    const m = new InMemoryStore();
    expect(await m.read('nope')).toBeUndefined();
  });

  it('lists entries with prefix', async () => {
    const m = new InMemoryStore();
    await m.write('a/1', 'one');
    await m.write('a/2', 'two');
    await m.write('b/1', 'three');
    const a = await m.list('a/');
    expect(a).toHaveLength(2);
    expect(a.map((e) => e.key).sort()).toEqual(['a/1', 'a/2']);
  });

  it('deletes an entry', async () => {
    const m = new InMemoryStore();
    await m.write('foo', 'bar');
    expect(await m.delete('foo')).toBe(true);
    expect(await m.read('foo')).toBeUndefined();
    expect(await m.delete('foo')).toBe(false);
  });

  it('preserves createdAt on update', async () => {
    const m = new InMemoryStore();
    const a = await m.write('k', '1');
    await new Promise((r) => setTimeout(r, 5));
    const b = await m.write('k', '2');
    expect(b.createdAt).toBe(a.createdAt);
    expect(b.updatedAt).toBeGreaterThan(a.updatedAt);
  });
});

describe('GitMemory', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitagent-mem-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('persists entries to disk', async () => {
    const m = new GitMemory({ path: path.join(tmpDir, 'mem') });
    await m.write('foo', 'hello');
    const e = await m.read('foo');
    expect(e?.content).toBe('hello');
  });

  it('lists entries recursively', async () => {
    const m = new GitMemory({ path: path.join(tmpDir, 'mem') });
    await m.write('a/1', 'one');
    await m.write('a/2', 'two');
    const a = await m.list('a/');
    expect(a).toHaveLength(2);
  });

  it('survives re-creation (real persistence)', async () => {
    const memPath = path.join(tmpDir, 'mem');
    const m1 = new GitMemory({ path: memPath });
    await m1.write('foo', 'persisted');
    const m2 = new GitMemory({ path: memPath });
    const e = await m2.read('foo');
    expect(e?.content).toBe('persisted');
  });

  it('rejects entries that exceed max size', async () => {
    const m = new GitMemory({ path: path.join(tmpDir, 'mem'), maxFileSize: 10 });
    await expect(m.write('big', 'a'.repeat(100))).rejects.toThrow();
  });

  it('handles raw text mode', async () => {
    const m = new GitMemory({ path: path.join(tmpDir, 'mem'), encode: false });
    await m.write('raw', 'plain text');
    const e = await m.read('raw');
    expect(e?.content).toBe('plain text');
  });
});

describe('EpisodicMemory', () => {
  it('records and retrieves episodes', async () => {
    const mem = new InMemoryStore();
    const ep = new EpisodicMemory(mem);
    await ep.record({ event: 'issues.opened', title: 'first issue', decision: 'labeled as bug' });
    await ep.record({ event: 'issues.opened', title: 'second issue', decision: 'closed as duplicate' });
    const recent = await ep.recent(10);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.title).toBe('second issue'); // most recent first
  });

  it('filters by context', async () => {
    const mem = new InMemoryStore();
    const ep = new EpisodicMemory(mem);
    await ep.record({ event: 'issues.opened', title: 'one', decision: 'a', context: { issueNumber: 1 } });
    await ep.record({ event: 'issues.opened', title: 'two', decision: 'b', context: { issueNumber: 2 } });
    await ep.record({ event: 'issues.opened', title: 'three', decision: 'c', context: { issueNumber: 1 } });
    const ctx = await ep.forContext('issueNumber', 1);
    expect(ctx).toHaveLength(2);
  });
});

describe('SemanticMemory', () => {
  it('finds similar entries via bag-of-words', async () => {
    const base = new InMemoryStore();
    const sem = new SemanticMemory({ base });
    await sem.write('a', 'how to fix a bug in the authentication system');
    await sem.write('b', 'recipe for chocolate chip cookies');
    await sem.write('c', 'authentication bug reported by user');
    const results = await sem.search('authentication problem');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.key).toMatch(/^[ac]$/);
  });

  it('uses a custom embedder if provided', async () => {
    const base = new InMemoryStore();
    const sem = new SemanticMemory({
      base,
      embed: (text) => [text.length, text.split(' ').length],
    });
    await sem.write('short', 'a b c');
    await sem.write('long', 'a b c d e f g h i j');
    const results = await sem.search('a b c');
    expect(results).toHaveLength(2);
  });

  it('respects minScore', async () => {
    const base = new InMemoryStore();
    const sem = new SemanticMemory({ base });
    await sem.write('a', 'foo bar baz');
    await sem.write('b', 'completely different content');
    const results = await sem.search('nothing in common at all', { minScore: 0.9 });
    expect(results).toHaveLength(0);
  });
});
