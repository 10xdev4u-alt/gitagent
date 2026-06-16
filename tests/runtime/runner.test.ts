/**
 * Tests for the agent runner.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runAgent, type RunContext } from '../../src/runtime/index.js';
import { InMemoryStore } from '../../src/memory/in-memory.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import type { Manifest } from '../../src/manifest/schema.js';
import type { ChatResponse, LLMProvider, ToolCall } from '../../src/providers/types.js';

function makeManifest(): Manifest {
  return {
    frontmatter: {
      name: 'test',
      triggers: ['issues.opened'],
      memory: { type: 'in-memory', path: 'memory', maxSizeBytes: 1048576, semantic: false },
      tools: ['echo'],
      approval: { read: 'never', write: 'never', planFirst: false, mention: [] },
      model: { provider: 'openai', name: 'test-model', temperature: 0, maxTokens: 1024 },
      limits: { maxSteps: 5, timeoutMs: 30_000, maxTotalTokens: 100_000, maxToolCalls: 10 },
      permissions: {
        repositories: [],
        protectedBranches: false,
        closeIssues: true,
        mergePRs: false,
        release: false,
        spend: false,
      },
      metadata: {},
    },
    body: 'You are a test agent.',
    path: '/test.md',
  };
}

function makeMockProvider(responses: ChatResponse[]): LLMProvider {
  let i = 0;
  return {
    name: 'mock',
    defaultModel: 'mock-1',
    chat: async () => {
      const r = responses[i++];
      if (!r) throw new Error('Mock provider exhausted');
      return r;
    },
  };
}

function textResponse(text: string, usage = { inputTokens: 10, outputTokens: 5 }): ChatResponse {
  return { content: text, toolCalls: [], usage, model: 'mock', stopReason: 'end_turn' };
}

function toolCallResponse(toolCalls: ToolCall[], text = ''): ChatResponse {
  return {
    content: text,
    toolCalls,
    usage: { inputTokens: 10, outputTokens: 5 },
    model: 'mock',
    stopReason: 'tool_use',
  };
}

describe('runAgent', () => {
  it('returns final text when LLM responds with text only', async () => {
    const manifest = makeManifest();
    const tools = new ToolRegistry();
    tools.register({
      name: 'echo',
      description: 'echo',
      inputSchema: z.object({ message: z.string() }),
      execute: async (input) => ({ ok: true, output: input }),
    });
    const provider = makeMockProvider([textResponse('All done!')]);
    const rc: RunContext = {
      manifest,
      event: { name: 'issues.opened', payload: { issue: { number: 1 } } },
      provider,
      tools,
      memory: new InMemoryStore(),
      repo: { owner: 'me', name: 'r' },
      runId: 'run-1',
      dryRun: false,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await runAgent(rc);
    expect(result.ok).toBe(true);
    expect(result.finalText).toBe('All done!');
    expect(result.toolExecutions).toHaveLength(0);
    expect(result.steps).toBe(1);
  });

  it('executes a tool call and loops', async () => {
    const manifest = makeManifest();
    const tools = new ToolRegistry();
    tools.register({
      name: 'echo',
      description: 'echo',
      inputSchema: z.object({ message: z.string() }),
      execute: async (input) => {
        const args = input as { message: string };
        return { ok: true, output: { echoed: args.message } };
      },
    });
    const provider = makeMockProvider([
      toolCallResponse([{ id: '1', name: 'echo', input: { message: 'hi' } }], 'Calling echo'),
      textResponse('Echo done'),
    ]);
    const rc: RunContext = {
      manifest,
      event: { name: 'issues.opened', payload: {} },
      provider,
      tools,
      memory: new InMemoryStore(),
      repo: { owner: 'me', name: 'r' },
      runId: 'run-1',
      dryRun: false,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await runAgent(rc);
    expect(result.ok).toBe(true);
    expect(result.toolExecutions).toHaveLength(1);
    expect(result.toolExecutions[0]?.name).toBe('echo');
    expect(result.toolExecutions[0]?.ok).toBe(true);
    expect(result.steps).toBe(2);
  });

  it('stops at maxSteps', async () => {
    const manifest = { ...makeManifest() };
    manifest.frontmatter.limits = { ...manifest.frontmatter.limits, maxSteps: 2 };
    const tools = new ToolRegistry();
    tools.register({
      name: 'echo',
      description: 'echo',
      inputSchema: z.object({ message: z.string() }),
      execute: async () => ({ ok: true, output: {} }),
    });
    const provider = makeMockProvider([
      toolCallResponse([{ id: '1', name: 'echo', input: { message: '1' } }]),
      toolCallResponse([{ id: '1', name: 'echo', input: { message: '2' } }]),
      textResponse('would never get here'),
    ]);
    const rc: RunContext = {
      manifest,
      event: { name: 'issues.opened', payload: {} },
      provider,
      tools,
      memory: new InMemoryStore(),
      repo: { owner: 'me', name: 'r' },
      runId: 'run-1',
      dryRun: false,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await runAgent(rc);
    expect(result.stopReason).toBe('max_steps');
    expect(result.steps).toBe(2);
  });

  it('rejects invalid tool input', async () => {
    const manifest = makeManifest();
    const tools = new ToolRegistry();
    tools.register({
      name: 'echo',
      description: 'echo',
      inputSchema: z.object({ message: z.string() }),
      execute: async () => ({ ok: true, output: {} }),
    });
    const provider = makeMockProvider([
      toolCallResponse([{ id: '1', name: 'echo', input: { wrong_field: 'hi' } }]),
      textResponse('Tried but failed'),
    ]);
    const rc: RunContext = {
      manifest,
      event: { name: 'issues.opened', payload: {} },
      provider,
      tools,
      memory: new InMemoryStore(),
      repo: { owner: 'me', name: 'r' },
      runId: 'run-1',
      dryRun: false,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await runAgent(rc);
    expect(result.toolExecutions[0]?.ok).toBe(false);
    expect(result.toolExecutions[0]?.error).toContain('Invalid input');
  });

  it('handles unknown tool', async () => {
    const manifest = makeManifest();
    manifest.frontmatter.tools = []; // no tools registered for the agent
    const tools = new ToolRegistry();
    const provider = makeMockProvider([
      toolCallResponse([{ id: '1', name: 'nonexistent', input: {} }]),
      textResponse('OK'),
    ]);
    const rc: RunContext = {
      manifest,
      event: { name: 'issues.opened', payload: {} },
      provider,
      tools,
      memory: new InMemoryStore(),
      repo: { owner: 'me', name: 'r' },
      runId: 'run-1',
      dryRun: false,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await runAgent(rc);
    expect(result.toolExecutions[0]?.error).toContain('not found');
  });
});
