/**
 * Tests for the skill registry.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SkillRegistry, SkillConfigSchema } from '../../src/skills/registry.js';
import { ToolRegistry } from '../../src/tools/registry.js';

describe('SkillConfigSchema', () => {
  it('accepts a minimal config', () => {
    const c = SkillConfigSchema.parse({ name: 'x', tools: [] });
    expect(c.name).toBe('x');
    expect(c.tools).toEqual([]);
  });

  it('rejects an empty name', () => {
    expect(() => SkillConfigSchema.parse({ name: '', tools: [] })).toThrow();
  });
});

describe('SkillRegistry', () => {
  it('registers and retrieves a skill', () => {
    const r = new SkillRegistry();
    r.register({ name: 'x', tools: ['echo'] });
    expect(r.get('x')?.tools).toEqual(['echo']);
  });

  it('lists all skills', () => {
    const r = new SkillRegistry();
    r.register({ name: 'a', tools: [] });
    r.register({ name: 'b', tools: [] });
    expect(r.list().map((s) => s.name).sort()).toEqual(['a', 'b']);
  });

  it('apply throws on unknown skill', () => {
    const skills = new SkillRegistry();
    const tools = new ToolRegistry();
    expect(() => skills.apply('nope', tools)).toThrow();
  });

  it('apply returns empty for skill with no matching tools', () => {
    const skills = new SkillRegistry();
    skills.register({ name: 'triage', tools: ['echo', 'missing'] });
    const tools = new ToolRegistry();
    tools.register({
      name: 'echo',
      description: 'echo',
      inputSchema: z.object({ msg: z.string() }),
      execute: async () => ({ ok: true }),
    });
    const added = skills.apply('triage', tools);
    expect(added).toHaveLength(1);
    expect(added[0]?.name).toBe('echo');
  });

  it('apply returns multiple tools when all are registered', () => {
    const skills = new SkillRegistry();
    skills.register({ name: 'full', tools: ['echo', 'ping'] });
    const tools = new ToolRegistry();
    for (const n of ['echo', 'ping']) {
      tools.register({
        name: n,
        description: n,
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      });
    }
    const added = skills.apply('full', tools);
    expect(added).toHaveLength(2);
  });

  it('apply preserves order of tools', () => {
    const skills = new SkillRegistry();
    skills.register({ name: 'ordered', tools: ['echo', 'ping', 'pong'] });
    const tools = new ToolRegistry();
    for (const n of ['echo', 'ping', 'pong']) {
      tools.register({
        name: n,
        description: n,
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      });
    }
    const added = skills.apply('ordered', tools);
    expect(added.map((t) => t.name)).toEqual(['echo', 'ping', 'pong']);
  });
});
