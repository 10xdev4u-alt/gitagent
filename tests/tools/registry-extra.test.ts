/**
 * Tests for the ToolRegistry.
 */

import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../../src/tools/registry.js';
import { ToolError } from '../../src/tools/errors.js';
import { z } from 'zod';

describe('ToolRegistry', () => {
  it('registers and retrieves a tool', () => {
    const r = new ToolRegistry();
    const tool = {
      name: 'echo',
      description: 'echo',
      inputSchema: z.object({ msg: z.string() }),
      execute: async () => ({ ok: true }),
    };
    r.register(tool);
    expect(r.get('echo')).toBe(tool);
  });

  it('lists all tools', () => {
    const r = new ToolRegistry();
    r.register({ name: 'a', description: 'a', inputSchema: z.object({}), execute: async () => ({}) });
    r.register({ name: 'b', description: 'b', inputSchema: z.object({}), execute: async () => ({}) });
    expect(r.list().map((t) => t.name).sort()).toEqual(['a', 'b']);
  });

  it('returns undefined for unknown tool', () => {
    const r = new ToolRegistry();
    expect(r.get('nope')).toBeUndefined();
  });

  it('throws on duplicate registration', () => {
    const r = new ToolRegistry();
    const tool = { name: 'a', description: 'a', inputSchema: z.object({}), execute: async () => ({}) };
    r.register(tool);
    expect(() => r.register(tool)).toThrow(ToolError);
  });

  it('size returns the number of tools', () => {
    const r = new ToolRegistry();
    expect(r.size).toBe(0);
    r.register({ name: 'a', description: 'a', inputSchema: z.object({}), execute: async () => ({}) });
    expect(r.size).toBe(1);
  });
});
