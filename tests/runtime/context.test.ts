/**
 * Tests for the runner context helpers.
 */

import { describe, expect, it } from 'vitest';
import { resolveToolDefs, buildToolContext, toLLMToolDefs } from '../../src/runtime/context.js';
import { parseManifest } from '../../src/manifest/loader.js';
import { InMemoryStore } from '../../src/memory/in-memory.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { z } from 'zod';
import type { RunContext } from '../../src/runtime/context.js';

function makeRC(tools: { name: string }[]): RunContext {
  const toolYaml = tools.map((t) => `  - ${t.name}`).join('\n');
  const m = parseManifest(`---
name: test
triggers:
  - issues.opened
tools:
${toolYaml}
---
# body`);
  const reg = new ToolRegistry();
  for (const t of tools) {
    reg.register({
      name: t.name,
      description: t.name,
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
    });
  }
  const noopLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  return {
    manifest: m,
    event: { name: 'issues.opened', payload: {} },
    provider: {} as never,
    tools: reg,
    memory: new InMemoryStore(),
    repo: { owner: 'foo', name: 'bar' },
    runId: 'r1',
    dryRun: false,
    logger: noopLogger,
  };
}

describe('resolveToolDefs', () => {
  it('resolves tools by name', () => {
    const rc = makeRC([{ name: 'echo' }, { name: 'ping' }]);
    const defs = resolveToolDefs(rc);
    expect(defs).toHaveLength(2);
  });

  it('throws on unknown tool', () => {
    const rc = makeRC([{ name: 'echo' }]);
    // Patch manifest to reference a non-existent tool
    rc.manifest.frontmatter.tools = ['nonexistent'];
    expect(() => resolveToolDefs(rc)).toThrow();
  });
});

describe('buildToolContext', () => {
  it('builds a ToolContext from a RunContext', () => {
    const rc = makeRC([{ name: 'echo' }]);
    const tc = buildToolContext(rc);
    expect(tc.agentName).toBe('test');
    expect(tc.runId).toBe('r1');
    expect(tc.repo).toEqual({ owner: 'foo', name: 'bar' });
    expect(tc.dryRun).toBe(false);
  });

  it('respects overrides', () => {
    const rc = makeRC([{ name: 'echo' }]);
    const tc = buildToolContext(rc, { dryRun: true });
    expect(tc.dryRun).toBe(true);
  });
});

describe('toLLMToolDefs', () => {
  it('converts to LLM tool defs', () => {
    const rc = makeRC([{ name: 'echo' }]);
    const defs = resolveToolDefs(rc);
    const llm = toLLMToolDefs(defs);
    expect(llm).toHaveLength(1);
    expect(llm[0]?.name).toBe('echo');
  });
});
