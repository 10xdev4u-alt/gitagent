/**
 * Tests for the skill registry.
 */

import { describe, expect, it } from 'vitest';
import { SkillRegistry, SkillConfigSchema } from '../../src/skills/registry.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { z } from 'zod';

describe('SkillConfigSchema', () => {
  it('accepts a valid config', () => {
    const c = SkillConfigSchema.parse({
      name: 'x',
      tools: ['github.post_comment'],
    });
    expect(c.name).toBe('x');
  });

  it('rejects an empty name', () => {
    expect(() => SkillConfigSchema.parse({ name: '', tools: [] })).toThrow();
  });
});

describe('SkillRegistry', () => {
  it('registers and retrieves a skill', () => {
    const r = new SkillRegistry();
    r.register({ name: 'x', tools: ['github.post_comment'] });
    expect(r.get('x')?.tools).toEqual(['github.post_comment']);
  });

  it('lists all skills', () => {
    const r = new SkillRegistry();
    r.register({ name: 'a', tools: [] });
    r.register({ name: 'b', tools: [] });
    expect(r.list().map((s) => s.name).sort()).toEqual(['a', 'b']);
  });

  it('apply adds the skill\'s tools to a registry', () => {
    const skills = new SkillRegistry();
    skills.register({ name: 'triage', tools: ['echo'] });
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

  it('apply skips tools that are not in the target registry', () => {
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
  });

  it('apply throws on unknown skill', () => {
    const skills = new SkillRegistry();
    const tools = new ToolRegistry();
    expect(() => skills.apply('nope', tools)).toThrow();
  });
});
