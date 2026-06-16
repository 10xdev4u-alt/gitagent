/**
 * OpenAI provider.
 *
 * Wraps the `openai` SDK and exposes the {@link LLMProvider} interface.
 * Also powers the OpenAI-compatible variant (any endpoint that speaks the
 * chat completions protocol) — pass a `baseURL` to use it.
 */

import { ProviderError } from './errors.js';
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LLMProvider,
  StreamEvent,
  ToolCall,
  ToolDefinition,
} from './types.js';

/** Options for the OpenAI / OpenAI-compatible provider. */
export interface OpenAIProviderOptions {
  apiKey?: string;
  /** Override the base URL (e.g. for OpenAI-compatible endpoints). */
  baseURL?: string;
  defaultModel?: string;
  /** Override the underlying SDK client (for testing). */
  clientFactory?: (apiKey: string, baseURL?: string) => unknown;
  /** Provider name. Defaults to 'openai'. Use 'openai-compatible' for custom endpoints. */
  providerName?: string;
}

/** Cached SDK type, loaded dynamically. */
type OpenAISDK = typeof import('openai').default;

let cachedSdk: OpenAISDK | null = null;

async function loadSdk(): Promise<OpenAISDK> {
  if (cachedSdk) return cachedSdk;
  try {
    const mod = await import('openai');
    cachedSdk = mod.default;
    return cachedSdk;
  } catch (err) {
    throw new ProviderError(
      'openai',
      'SDK_MISSING',
      'openai is not installed. Run `npm install openai` to add it.',
      { cause: err },
    );
  }
}

/**
 * Implements the {@link LLMProvider} interface for OpenAI's chat completions API.
 * Also works for any OpenAI-compatible endpoint (Ollama, vLLM, Together, etc.)
 * when a `baseURL` is provided.
 */
export class OpenAIProvider implements LLMProvider {
  public readonly name: string;
  public readonly defaultModel: string;
  private readonly apiKey: string | undefined;
  private readonly baseURL: string | undefined;
  private readonly clientFactory: (apiKey: string, baseURL?: string) => unknown;
  private cachedClient: unknown | null = null;

  constructor(options: OpenAIProviderOptions = {}) {
    this.name = options.providerName ?? 'openai';
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.baseURL = options.baseURL ?? process.env.OPENAI_BASE_URL;
    this.defaultModel = options.defaultModel ?? (this.name === 'openai' ? 'gpt-4o' : 'gpt-3.5-turbo');
    this.clientFactory =
      options.clientFactory ??
      ((key, base) =>
        new (cachedSdk as unknown as new (opts: { apiKey: string; baseURL?: string }) => unknown)({
          apiKey: key,
          ...(base ? { baseURL: base } : {}),
        }));
  }

  private async client(): Promise<unknown> {
    if (this.cachedClient) return this.cachedClient;
    if (!this.apiKey) {
      throw new ProviderError(
        this.name,
        'INVALID_API_KEY',
        `No API key for ${this.name}. Set the appropriate env var or pass apiKey in options.`,
      );
    }
    if (!cachedSdk) await loadSdk();
    this.cachedClient = this.clientFactory(this.apiKey, this.baseURL);
    return this.cachedClient;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResponse> {
    const client = (await this.client()) as InstanceType<OpenAISDK>;
    const params: Parameters<InstanceType<OpenAISDK>['chat']['completions']['create']>[0] = {
      model: (options.model ?? this.defaultModel) as Parameters<
        InstanceType<OpenAISDK>['chat']['completions']['create']
      >[0]['model'],
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
      })) as Parameters<InstanceType<OpenAISDK>['chat']['completions']['create']>[0]['messages'],
    };
    if (options.temperature !== undefined) params.temperature = options.temperature;
    if (options.maxTokens !== undefined) params.max_tokens = options.maxTokens;
    if (options.topP !== undefined) params.top_p = options.topP;
    if (options.stopSequences) params.stop = options.stopSequences;
    if (options.tools && options.tools.length > 0) {
      params.tools = options.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema as Record<string, never>,
        },
      })) as unknown as Parameters<InstanceType<OpenAISDK>['chat']['completions']['create']>[0]['tools'];
    }

    try {
      const response = await client.chat.completions.create(params);
      return fromOpenAIResponse(response);
    } catch (err) {
      throw mapOpenAIError(err, this.name);
    }
  }

  async *stream(messages: ChatMessage[], options: ChatOptions = {}): AsyncIterable<StreamEvent> {
    const client = (await this.client()) as InstanceType<OpenAISDK>;
    const params: Parameters<InstanceType<OpenAISDK>['chat']['completions']['create']>[0] = {
      model: (options.model ?? this.defaultModel) as Parameters<
        InstanceType<OpenAISDK>['chat']['completions']['create']
      >[0]['model'],
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
      })) as Parameters<InstanceType<OpenAISDK>['chat']['completions']['create']>[0]['messages'],
      stream: true,
      stream_options: { include_usage: true } as unknown as Record<string, never>,
    };
    if (options.temperature !== undefined) params.temperature = options.temperature;
    if (options.maxTokens !== undefined) params.max_tokens = options.maxTokens;
    if (options.topP !== undefined) params.top_p = options.topP;
    if (options.stopSequences) params.stop = options.stopSequences;
    if (options.tools && options.tools.length > 0) {
      params.tools = options.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema as Record<string, never>,
        },
      })) as unknown as Parameters<InstanceType<OpenAISDK>['chat']['completions']['create']>[0]['tools'];
    }

    let stream: AsyncIterable<unknown>;
    try {
      const created = await client.chat.completions.create(params);
      stream = created as unknown as AsyncIterable<unknown>;
    } catch (err) {
      yield { type: 'error', error: mapOpenAIError(err, this.name) };
      return;
    }

    yield { type: 'message_start', model: options.model ?? this.defaultModel };

    let currentText = '';
    const toolBuffers: Map<string, { name: string; args: string }> = new Map();
    const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    let finalUsage: { inputTokens: number; outputTokens: number } = { inputTokens: 0, outputTokens: 0 };

    try {
      for await (const rawChunk of stream) {
        const chunk = rawChunk as {
          choices?: Array<{
            delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
            finish_reason?: string | null;
          }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;

        if (delta?.content) {
          if (!currentText) yield { type: 'text_start' };
          currentText += delta.content;
          yield { type: 'text_delta', delta: delta.content };
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.id) {
              toolBuffers.set(tc.index.toString(), {
                name: tc.function?.name ?? '',
                args: tc.function?.arguments ?? '',
              });
              yield { type: 'tool_call_start', id: tc.id, name: tc.function?.name ?? '' };
            } else {
              const existing = toolBuffers.get(tc.index.toString());
              if (existing) {
                existing.args += tc.function?.arguments ?? '';
                yield { type: 'tool_call_delta', id: existing.name, delta: tc.function?.arguments ?? '' };
              }
            }
          }
        }

        if (chunk.usage) {
          finalUsage = {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
          };
        }
      }

      if (currentText) yield { type: 'text_end' };

      for (const [index, buf] of toolBuffers) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(buf.args || '{}') as Record<string, unknown>;
        } catch {
          input = { _raw: buf.args };
        }
        const id = `call_${index}`;
        toolCalls.push({ id, name: buf.name, input });
        yield { type: 'tool_call_end', id, input };
      }

      yield { type: 'message_end', usage: finalUsage, stopReason: 'stop' };
    } catch (err) {
      yield { type: 'error', error: mapOpenAIError(err, this.name) };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fromOpenAIResponse(response: unknown): ChatResponse {
  const r = response as {
    choices: Array<{
      message: { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
      finish_reason: string | null;
    }>;
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const choice = r.choices[0];
  const message = choice?.message;
  const text = message?.content ?? '';
  const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((tc) => {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
    } catch {
      input = { _raw: tc.function.arguments };
    }
    return { id: tc.id, name: tc.function.name, input };
  });

  return {
    content: text,
    toolCalls,
    usage: {
      inputTokens: r.usage?.prompt_tokens ?? 0,
      outputTokens: r.usage?.completion_tokens ?? 0,
    },
    model: r.model,
    stopReason: choice?.finish_reason ?? null,
  };
}

function mapOpenAIError(err: unknown, providerName: string): ProviderError {
  const e = err as { status?: number; message?: string; code?: string; error?: { message?: string; code?: string } };
  const status = e.status;
  const code = e.code ?? e.error?.code;
  const message = e.message ?? e.error?.message ?? 'Unknown OpenAI error';

  if (status === 401 || code === 'invalid_api_key') {
    return new ProviderError(providerName, 'INVALID_API_KEY', message, { statusCode: status, cause: err });
  }
  if (status === 429 || code === 'rate_limit_exceeded') {
    return new ProviderError(providerName, 'RATE_LIMITED', message, { statusCode: status, cause: err });
  }
  if (status === 408 || code === 'timeout') {
    return new ProviderError(providerName, 'TIMEOUT', message, { statusCode: status, cause: err });
  }
  if (code === 'context_length_exceeded' || (status === 400 && /context|length|token/i.test(message))) {
    return new ProviderError(providerName, 'CONTEXT_LENGTH_EXCEEDED', message, { statusCode: status, cause: err });
  }
  if (status === 400 && code === 'content_policy_violation') {
    return new ProviderError(providerName, 'CONTENT_FILTERED', message, { statusCode: status, cause: err });
  }
  if (status && status >= 500) {
    return new ProviderError(providerName, 'NETWORK_ERROR', message, { statusCode: status, cause: err });
  }
  return new ProviderError(providerName, 'UNKNOWN', message, { statusCode: status, cause: err });
}
