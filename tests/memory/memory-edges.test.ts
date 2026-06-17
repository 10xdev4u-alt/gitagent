/**
 * Tests for memory edge cases and adapters.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { InMemoryStore } from '../../src/memory/in-memory.js';
import { GitMemory } from '../../src/memory/git.js';
import { EpisodicMemory } from '../../src/memory/episodic.js';
import { SemanticMemory } from '../../src/memory/semantic.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('InMemoryStore edge cases', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('returns undefined for missing key', async () => {
    expect(await store.read('missing')).toBeUndefined();
  });

  it('overwrites existing key', async () => {
    await store.write('k', 'first');
    await store.write('k', 'second');
    expect((await store.read('k'))?.content).toBe('second');
  });

  it('lists with prefix only', async () => {
    await store.write('user:1', 'a');
    await store.write('user:2', 'b');
    await store.write('issue:1', 'c');
    const users = await store.list('user:');
    expect(users).toHaveLength(2);
  });

  it('handles JSON values gracefully', async () => {
    await store.write('k', JSON.stringify({ a: 1, b: { c: 2 } }));
    const v = await store.read('k');
    expect(v?.content).toBe('{"a":1,"b":{"c":2}}');
  });

  it('metadata is preserved', async () => {
    await store.write('k', 'v', { metadata: { tag: 'test' } });
    expect((await store.read('k'))?.metadata?.tag).toBe('test');
  });

  it('count returns the number of entries', async () => {
    await store.write('a', '1');
    await store.write('b', '2');
    expect(await store.count()).toBe(2);
  });

  it('delete removes the entry', async () => {
    await store.write('a', '1');
    expect(await store.delete('a')).toBe(true);
    expect(await store.read('a')).toBeUndefined();
  });

  it('delete returns false for missing key', async () => {
    expect(await store.delete('missing')).toBe(false);
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
    await mem.write('k', 'v1');
    const mem2 = new GitMemory({ path: dir });
    expect((await mem2.read('k'))?.content).toBe('v1');
  });

  it('creates parent dirs for nested keys', async () => {
    await mem.write('a/b/c', 'v');
    expect((await mem.read('a/b/c'))?.content).toBe('v');
  });
});

describe('EpisodicMemory', () => {
  it('records and retrieves recent episodes', async () => {
    const inner = new InMemoryStore();
    const epi = new EpisodicMemory(inner);
    for (let i = 0; i < 5; i++) {
      await epi.record({ event: 'manual', title: `episode ${i}`, decision: 'did a thing' });
    }
    const recent = await epi.recent(3);
    expect(recent.length).toBe(3);
  });

  it('forContext filters episodes by context', async () => {
    const inner = new InMemoryStore();
    const epi = new EpisodicMemory(inner);
    await epi.record({
      event: 'manual',
      title: 'triage issue 1',
      decision: 'labeled as bug',
      context: { issueNumber: 1 },
    });
    await epi.record({
      event: 'manual',
      title: 'triage issue 2',
      decision: 'labeled as feature',
      context: { issueNumber: 2 },
    });
    const issue1 = await epi.forContext('issueNumber', 1);
    expect(issue1).toHaveLength(1);
    expect(issue1[0]?.context?.issueNumber).toBe(1);
  });
});

describe('SemanticMemory', () => {
  it('returns similar results for similar input', async () => {
    const inner = new InMemoryStore();
    const sem = new SemanticMemory({ base: inner });
    await sem.write('a', 'the quick brown fox');
    await sem.write('b', 'a quick brown dog');
    await sem.write('c', 'totally unrelated text');
    const results = await sem.search('quick brown cat', { limit: 2 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.key).not.toBe('c');
  });

  it('respects topK limit', async () => {
    const inner = new InMemoryStore();
    const sem = new SemanticMemory({ base: inner });
    for (let i = 0; i < 10; i++) {
      await sem.write(`k${i}`, `value ${i}`);
    }
    const results = await sem.search('value', { limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
