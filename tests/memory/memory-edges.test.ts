/**
 * Tests for memory edge cases and adapters.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { InMemoryStore } from '../../src/memory/in-memory.js';
import { GitMemory } from '../../src/memory/git.js';
import { EpisodicMemory } from '../../src/memory/episodic.js';
import { SemanticMemory } from '../../src/memory/semantic.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('InMemoryStore edge cases', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('returns null for missing key', async () => {
    expect(await store.read('missing')).toBeNull();
  });

  it('overwrites existing key', async () => {
    await store.write('k', { v: 1 });
    await store.write('k', { v: 2 });
    expect((await store.read('k'))?.v).toBe(2);
  });

  it('lists with prefix only', async () => {
    await store.write('user:1', { id: 1 });
    await store.write('user:2', { id: 2 });
    await store.write('issue:1', { id: 1 });
    const users = await store.list('user:');
    expect(users).toHaveLength(2);
  });

  it('handles non-JSON values gracefully', async () => {
    await store.write('k', { a: 1, b: { c: 2 } });
    const v = await store.read('k');
    expect(v).toEqual({ a: 1, b: { c: 2 } });
  });

  it('metadata is preserved', async () => {
    await store.write('k', { v: 1 }, { tag: 'test' });
    expect((await store.read('k', { includeMetadata: true }))?.metadata?.tag).toBe('test');
  });
});

describe('GitMemory', () => {
  let dir: string;
  let mem: GitMemory;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gitagent-mem-'));
    mem = new GitMemory({ path: dir });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists values across instances', async () => {
    await mem.write('k', { v: 1 });
    const mem2 = new GitMemory({ path: dir });
    expect((await mem2.read('k'))?.v).toBe(1);
  });

  it('creates parent dirs for nested keys', async () => {
    await mem.write('a/b/c', { v: 1 });
    expect((await mem.read('a/b/c'))?.v).toBe(1);
  });
});

describe('EpisodicMemory', () => {
  it('returns recent episodes in order', async () => {
    const inner = new InMemoryStore();
    const epi = new EpisodicMemory(inner);
    for (let i = 0; i < 5; i++) {
      await epi.append({ type: 'event', data: { i } });
    }
    const recent = await epi.recent(3);
    expect(recent).toHaveLength(3);
    expect((recent[0]?.data as { i: number })?.i).toBeGreaterThan((recent[2]?.data as { i: number })?.i ?? 0);
  });

  it('search by type', async () => {
    const inner = new InMemoryStore();
    const epi = new EpisodicMemory(inner);
    await epi.append({ type: 'a', data: {} });
    await epi.append({ type: 'b', data: {} });
    await epi.append({ type: 'a', data: {} });
    const aEpisodes = await epi.search({ type: 'a' });
    expect(aEpisodes).toHaveLength(2);
  });
});

describe('SemanticMemory', () => {
  it('returns similar results for similar input', async () => {
    const inner = new InMemoryStore();
    const sem = new SemanticMemory(inner);
    await sem.write('a', 'the quick brown fox');
    await sem.write('b', 'a quick brown dog');
    await sem.write('c', 'totally unrelated text');
    const results = await sem.search('quick brown cat', 2);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.key).not.toBe('c');
  });

  it('respects topK limit', async () => {
    const inner = new InMemoryStore();
    const sem = new SemanticMemory(inner);
    for (let i = 0; i < 10; i++) {
      await sem.write(`k${i}`, `value ${i}`);
    }
    const results = await sem.search('value', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
