/**
 * Tests for the tool registry + tool interface.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../../src/tools/registry.js';
import { toLLMTool, zodToJsonSchema } from '../../src/tools/types.js';
import { ManifestError } from '../../src/manifest/errors.js';

function makeTool(name: string) {
  return {
    name,
    description: `A tool called ${name}`,
    inputSchema: z.object({ x: z.string() }),
    execute: async () => ({ ok: true }),
  };
}

describe('ToolRegistry', () => {
  it('registers and retrieves a tool', () => {
    const r = new ToolRegistry();
    const t = makeTool('foo');
    r.register(t);
    expect(r.get('foo')).toBe(t);
    expect(r.size).toBe(1);
  });

  it('throws on duplicate registration', () => {
    const r = new ToolRegistry();
    r.register(makeTool('foo'));
    expect(() => r.register(makeTool('foo'))).toThrow(ManifestError);
  });

  it('require throws on unknown tool', () => {
    const r = new ToolRegistry();
    expect(() => r.require('nope')).toThrow(ManifestError);
  });

  it('list/names return all tools', () => {
    const r = new ToolRegistry();
    r.register(makeTool('a'));
    r.register(makeTool('b'));
    expect(r.names().sort()).toEqual(['a', 'b']);
    expect(r.list()).toHaveLength(2);
  });

  it('toLLMTools returns LLM-formatted tool defs', () => {
    const r = new ToolRegistry();
    r.register(makeTool('foo'));
    const llm = r.toLLMTools(['foo']);
    expect(llm).toHaveLength(1);
    expect(llm[0]?.name).toBe('foo');
    expect(llm[0]?.description).toBe('A tool called foo');
    expect(llm[0]?.inputSchema).toBeDefined();
  });

  it('toLLMTools throws on unknown name', () => {
    const r = new ToolRegistry();
    expect(() => r.toLLMTools(['nope'])).toThrow(ManifestError);
  });
});

describe('zodToJsonSchema', () => {
  it('converts string', () => {
    expect(zodToJsonSchema(z.string())).toEqual({ type: 'string' });
  });

  it('converts number', () => {
    expect(zodToJsonSchema(z.number())).toEqual({ type: 'number' });
  });

  it('converts boolean', () => {
    expect(zodToJsonSchema(z.boolean())).toEqual({ type: 'boolean' });
  });

  it('converts object', () => {
    const s = zodToJsonSchema(z.object({ a: z.string(), b: z.number() }));
    expect(s).toEqual({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'number' } },
      required: ['a', 'b'],
    });
  });

  it('converts array', () => {
    expect(zodToJsonSchema(z.array(z.string()))).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('converts enum', () => {
    expect(zodToJsonSchema(z.enum(['a', 'b']))).toEqual({ type: 'string', enum: ['a', 'b'] });
  });

  it('omits optional fields from required', () => {
    const s = zodToJsonSchema(z.object({ a: z.string().optional(), b: z.number() }));
    expect(s).toMatchObject({ required: ['b'] });
  });
});

describe('toLLMTool', () => {
  it('formats a tool for the LLM', () => {
    const t = makeTool('foo');
    const llm = toLLMTool(t);
    expect(llm.name).toBe('foo');
    expect(llm.description).toBe('A tool called foo');
    expect(llm.inputSchema).toBeDefined();
  });
});
