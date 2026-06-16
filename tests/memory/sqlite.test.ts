/**
 * Tests for the SQLite memory backend.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteMemory } from '../../src/memory/sqlite.js';

describe('SqliteMemory', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitagent-sqlite-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes and reads an entry', async () => {
    const m = await SqliteMemory.open({ path: path.join(tmpDir, 'mem.db') });
    await m.write('foo', 'hello');
    const e = await m.read('foo');
    expect(e?.content).toBe('hello');
    await m.close();
  });

  it('persists across reopens', async () => {
    const memPath = path.join(tmpDir, 'mem.db');
    const m1 = await SqliteMemory.open({ path: memPath });
    await m1.write('foo', 'persisted');
    await m1.close();
    const m2 = await SqliteMemory.open({ path: memPath });
    const e = await m2.read('foo');
    expect(e?.content).toBe('persisted');
    await m2.close();
  });

  it('lists entries with prefix', async () => {
    const m = await SqliteMemory.open({ path: path.join(tmpDir, 'mem.db') });
    await m.write('a/1', 'one');
    await m.write('a/2', 'two');
    await m.write('b/1', 'three');
    const list = await m.list('a/');
    expect(list).toHaveLength(2);
    await m.close();
  });

  it('returns entries most recent first', async () => {
    const m = await SqliteMemory.open({ path: path.join(tmpDir, 'mem.db') });
    await m.write('a', 'first');
    await new Promise((r) => setTimeout(r, 5));
    await m.write('b', 'second');
    const list = await m.list();
    expect(list[0]?.key).toBe('b');
    await m.close();
  });

  it('preserves createdAt on update', async () => {
    const m = await SqliteMemory.open({ path: path.join(tmpDir, 'mem.db') });
    const a = await m.write('k', '1');
    await new Promise((r) => setTimeout(r, 5));
    const b = await m.write('k', '2');
    expect(b.createdAt).toBe(a.createdAt);
    expect(b.updatedAt).toBeGreaterThan(a.updatedAt);
    await m.close();
  });

  it('deletes an entry', async () => {
    const m = await SqliteMemory.open({ path: path.join(tmpDir, 'mem.db') });
    await m.write('foo', 'bar');
    expect(await m.delete('foo')).toBe(true);
    expect(await m.delete('foo')).toBe(false);
    await m.close();
  });

  it('counts entries', async () => {
    const m = await SqliteMemory.open({ path: path.join(tmpDir, 'mem.db') });
    await m.write('a', '1');
    await m.write('b', '2');
    expect(await m.count()).toBe(2);
    await m.close();
  });

  it('stores and retrieves metadata as JSON', async () => {
    const m = await SqliteMemory.open({ path: path.join(tmpDir, 'mem.db') });
    await m.write('k', 'v', { metadata: { tags: ['a', 'b'], n: 42 } });
    const e = await m.read('k');
    expect(e?.metadata).toEqual({ tags: ['a', 'b'], n: 42 });
    await m.close();
  });
});
