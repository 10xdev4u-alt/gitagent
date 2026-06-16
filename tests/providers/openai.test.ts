/**
 * Tests for the OpenAI provider.
 */

import { describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '../../src/providers/openai.js';
import { ProviderError } from '../../src/providers/errors.js';

function makeMockClient(responses: unknown[]) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          const r = responses[i++];
          if (r instanceof Error) throw r;
          return r;
        }),
      },
    },
  };
}

describe('OpenAIProvider', () => {
  it('rejects chat with no API key', async () => {
    delete process.env.OPENAI_API_KEY;
    const p = new OpenAIProvider({ apiKey: undefined });
    await expect(p.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(ProviderError);
  });

  it('returns content and usage from a chat response', async () => {
    const mock = makeMockClient([
      {
        choices: [
          {
            message: { content: 'Hello back', tool_calls: [] },
            finish_reason: 'stop',
          },
        ],
        model: 'gpt-4o-test',
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    ]);
    const p = new OpenAIProvider({ apiKey: 'test', clientFactory: () => mock });
    const r = await p.chat([{ role: 'user', content: 'Hi' }]);
    expect(r.content).toBe('Hello back');
    expect(r.usage.inputTokens).toBe(10);
    expect(r.usage.outputTokens).toBe(5);
    expect(r.model).toBe('gpt-4o-test');
  });

  it('extracts tool calls', async () => {
    const mock = makeMockClient([
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'post_comment',
                    arguments: '{"body":"hi"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        model: 'gpt-4o-test',
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    ]);
    const p = new OpenAIProvider({ apiKey: 'test', clientFactory: () => mock });
    const r = await p.chat([{ role: 'user', content: 'do' }], {
      tools: [{ name: 'post_comment', description: 'post', inputSchema: {} }],
    });
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0]?.name).toBe('post_comment');
    expect(r.toolCalls[0]?.input).toEqual({ body: 'hi' });
  });

  it('handles malformed tool call JSON gracefully', async () => {
    const mock = makeMockClient([
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'foo', arguments: '{bad' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        model: 'gpt-4o-test',
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    ]);
    const p = new OpenAIProvider({ apiKey: 'test', clientFactory: () => mock });
    const r = await p.chat([{ role: 'user', content: 'do' }]);
    expect(r.toolCalls[0]?.input).toEqual({ _raw: '{bad' });
  });

  it('maps 401 errors to INVALID_API_KEY', async () => {
    const err = Object.assign(new Error('bad key'), { status: 401, code: 'invalid_api_key' });
    const mock = makeMockClient([err]);
    const p = new OpenAIProvider({ apiKey: 'test', clientFactory: () => mock });
    try {
      await p.chat([{ role: 'user', content: 'hi' }]);
      expect.unreachable();
    } catch (e) {
      expect((e as ProviderError).code).toBe('INVALID_API_KEY');
    }
  });

  it('maps 429 to RATE_LIMITED', async () => {
    const err = Object.assign(new Error('rl'), { status: 429, code: 'rate_limit_exceeded' });
    const mock = makeMockClient([err]);
    const p = new OpenAIProvider({ apiKey: 'test', clientFactory: () => mock });
    try {
      await p.chat([{ role: 'user', content: 'hi' }]);
      expect.unreachable();
    } catch (e) {
      const pe = e as ProviderError;
      expect(pe.code).toBe('RATE_LIMITED');
      expect(pe.isRetryable()).toBe(true);
    }
  });

  it('uses providerName option for error reporting', async () => {
    const mock = makeMockClient([Object.assign(new Error('bad'), { status: 401 })]);
    const p = new OpenAIProvider({
      apiKey: 'test',
      clientFactory: () => mock,
      providerName: 'openai-compatible',
    });
    try {
      await p.chat([{ role: 'user', content: 'hi' }]);
      expect.unreachable();
    } catch (e) {
      expect((e as ProviderError).provider).toBe('openai-compatible');
    }
  });
});
