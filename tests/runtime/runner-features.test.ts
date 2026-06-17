/**
 * Tests for the runner with retry, cost, and observer.
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { runAgent, type RunContext } from '../../src/runtime/index.js';
import { InMemoryStore } from '../../src/memory/in-memory.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { ObserverBus } from '../../src/runtime/observability.js';
import { ProviderError } from '../../src/providers/errors.js';
import type { Manifest } from '../../src/manifest/schema.js';
import type { ChatResponse, LLMProvider } from '../../src/providers/types.js';

function makeManifest(): Manifest {
  return {
    frontmatter: {
      name: 'test',
      triggers: ['issues.opened'],
      memory: { type: 'in-memory', path: 'memory', maxSizeBytes: 1048576, semantic: false },
      tools: [],
      approval: { read: 'never', write: 'required', planFirst: false, mention: [] },
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
    chat: vi.fn(async () => {
      const r = responses[i++];
      if (!r) throw new Error('Mock provider exhausted');
      return r;
    }),
  };
}

function textResponse(text: string, usage = { inputTokens: 10, outputTokens: 5 }): ChatResponse {
  return { content: text, toolCalls: [], usage, model: 'mock', stopReason: 'end_turn' };
}

const ctxBase = (overrides: Partial<RunContext> = {}): RunContext => ({
  manifest: makeManifest(),
  event: { name: 'issues.opened', payload: {} },
  provider: makeMockProvider([]),
  tools: new ToolRegistry(),
  memory: new InMemoryStore(),
  repo: { owner: 'me', name: 'r' },
  runId: 'r1',
  dryRun: false,
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  ...overrides,
});

describe('runAgent with observers', () => {
  it('emits run_start and run_end events', async () => {
    const bus = new ObserverBus();
    const events: string[] = [];
    bus.add((e) => { events.push(e.type); });

    const rc = ctxBase({
      provider: makeMockProvider([textResponse('done')]),
    });
    await runAgent(rc, { observers: bus });

    expect(events[0]).toBe('run_start');
    expect(events).toContain('step_end');
    expect(events[events.length - 1]).toBe('run_end');
  });

  it('emits step_end events with usage and cost', async () => {
    const bus = new ObserverBus();
    const stepEnds: unknown[] = [];
    bus.add((e) => {
      if (e.type === 'step_end') stepEnds.push(e);
    });

    const rc = ctxBase({
      provider: makeMockProvider([textResponse('done')]),
    });
    await runAgent(rc, { observers: bus });

    expect(stepEnds.length).toBeGreaterThan(0);
    const ev = stepEnds[0] as { usage: { costUsd?: number } };
    expect(ev.usage.costUsd).toBeGreaterThan(0);
  });
});

describe('runAgent with retry', () => {
  it('retries on retryable errors', async () => {
    let calls = 0;
    const provider: LLMProvider = {
      name: 'mock',
      defaultModel: 'mock-1',
      chat: vi.fn(async () => {
        calls++;
        if (calls < 3) {
          throw new ProviderError('mock', 'RATE_LIMITED', 'rate limit');
        }
        return textResponse('ok after retry');
      }),
    };
    const rc = ctxBase({ provider });
    const result = await runAgent(rc, { retry: { maxAttempts: 5, initialBackoffMs: 1, maxBackoffMs: 10, backoffMultiplier: 2, jitterFactor: 0 } });
    expect(result.finalText).toBe('ok after retry');
    expect(calls).toBe(3);
  });

  it('does not retry on non-retryable errors', async () => {
    let calls = 0;
    const provider: LLMProvider = {
      name: 'mock',
      defaultModel: 'mock-1',
      chat: vi.fn(async () => {
        calls++;
        throw new ProviderError('mock', 'INVALID_API_KEY', 'bad key');
      }),
    };
    const rc = ctxBase({ provider });
    await expect(
      runAgent(rc, { retry: { maxAttempts: 5, initialBackoffMs: 1, maxBackoffMs: 10, backoffMultiplier: 2, jitterFactor: 0 } }),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
