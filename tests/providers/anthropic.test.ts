/**
 * Tests for the Anthropic provider.
 *
 * Uses a mock client factory to avoid hitting the real API.
 */

import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../../src/providers/anthropic.js';
import { ProviderError } from '../../src/providers/errors.js';

function makeMockClient(responses: unknown[]) {
  let i = 0;
  return {
    messages: {
      create: vi.fn(async () => {
        const r = responses[i++];
        if (r instanceof Error) throw r;
        return r;
      }),
      stream: vi.fn(async () => ({
        [Symbol.asyncIterator]: async function* () {
          // Yield events for a simple text response
          yield { type: 'message_start', message: { model: 'claude-test' } };
          yield {
            type: 'content_block_start',
            content_block: { type: 'text', text: '' },
            index: 0,
          };
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Hello' },
            index: 0,
          };
          yield { type: 'content_block_stop', index: 0 };
          yield { type: 'message_stop' };
        },
        finalMessage: async () => ({
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: 'end_turn',
        }),
      })),
    },
  };
}

describe('AnthropicProvider', () => {
  it('rejects chat with no API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const p = new AnthropicProvider({ apiKey: undefined });
    await expect(p.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(ProviderError);
  });

  it('returns content and usage from a chat response', async () => {
    const mock = makeMockClient([
      {
        content: [{ type: 'text', text: 'Hello back' }],
        model: 'claude-test',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    ]);
    const p = new AnthropicProvider({
      apiKey: 'test',
      clientFactory: () => mock,
    });
    const r = await p.chat([
      { role: 'system', content: 'You are X.' },
      { role: 'user', content: 'Hi' },
    ]);
    expect(r.content).toBe('Hello back');
    expect(r.usage.inputTokens).toBe(10);
    expect(r.usage.outputTokens).toBe(5);
    expect(r.stopReason).toBe('end_turn');
    expect(r.model).toBe('claude-test');
  });

  it('extracts tool calls from the response', async () => {
    const mock = makeMockClient([
      {
        content: [
          { type: 'text', text: 'Calling tool' },
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'post_comment',
            input: { body: 'hi' },
          },
        ],
        model: 'claude-test',
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    ]);
    const p = new AnthropicProvider({
      apiKey: 'test',
      clientFactory: () => mock,
    });
    const r = await p.chat([{ role: 'user', content: 'do it' }], {
      tools: [{ name: 'post_comment', description: 'post', inputSchema: {} }],
    });
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0]?.name).toBe('post_comment');
    expect(r.toolCalls[0]?.input).toEqual({ body: 'hi' });
  });

  it('maps 401 errors to INVALID_API_KEY', async () => {
    const err = Object.assign(new Error('unauthorized'), { status: 401 });
    const mock = makeMockClient([err]);
    const p = new AnthropicProvider({
      apiKey: 'test',
      clientFactory: () => mock,
    });
    try {
      await p.chat([{ role: 'user', content: 'hi' }]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).code).toBe('INVALID_API_KEY');
    }
  });

  it('maps 429 errors to RATE_LIMITED and marks retryable', async () => {
    const err = Object.assign(new Error('rate limit'), { status: 429 });
    const mock = makeMockClient([err]);
    const p = new AnthropicProvider({
      apiKey: 'test',
      clientFactory: () => mock,
    });
    try {
      await p.chat([{ role: 'user', content: 'hi' }]);
      expect.unreachable();
    } catch (e) {
      const pe = e as ProviderError;
      expect(pe.code).toBe('RATE_LIMITED');
      expect(pe.isRetryable()).toBe(true);
    }
  });

  it('maps 5xx errors to NETWORK_ERROR and marks retryable', async () => {
    const err = Object.assign(new Error('server error'), { status: 500 });
    const mock = makeMockClient([err]);
    const p = new AnthropicProvider({
      apiKey: 'test',
      clientFactory: () => mock,
    });
    try {
      await p.chat([{ role: 'user', content: 'hi' }]);
      expect.unreachable();
    } catch (e) {
      const pe = e as ProviderError;
      expect(pe.code).toBe('NETWORK_ERROR');
      expect(pe.isRetryable()).toBe(true);
    }
  });
});

describe('AnthropicProvider stream()', () => {
  it('yields text deltas and a final message_end', async () => {
    const mock = makeMockClient([]);
    const p = new AnthropicProvider({
      apiKey: 'test',
      clientFactory: () => mock,
    });
    const events: string[] = [];
    for await (const e of p.stream([{ role: 'user', content: 'hi' }])) {
      events.push(e.type);
    }
    expect(events).toContain('message_start');
    expect(events).toContain('text_start');
    expect(events).toContain('text_delta');
    expect(events).toContain('text_end');
    expect(events).toContain('message_end');
  });
});
