/**
 * Anthropic provider.
 *
 * Wraps the @anthropic-ai/sdk and exposes the {@link LLMProvider} interface.
 * The SDK is loaded lazily on first use so the bundle stays small when
 * users pick a different provider.
 */

import { ProviderError } from './errors.js';
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LLMProvider,
  StreamEvent,
  ToolCall,
} from './types.js';

/** Options for the Anthropic provider. */
export interface AnthropicProviderOptions {
  apiKey?: string;
  defaultModel?: string;
  /** Override the underlying SDK client (for testing). */
  clientFactory?: (apiKey: string) => unknown;
}

/** Cached SDK type, loaded dynamically. */
type AnthropicSDK = typeof import('@anthropic-ai/sdk').default;

let cachedSdk: AnthropicSDK | null = null;

async function loadSdk(): Promise<AnthropicSDK> {
  if (cachedSdk) return cachedSdk;
  try {
    const mod = await import('@anthropic-ai/sdk');
    cachedSdk = mod.default;
    return cachedSdk;
  } catch (err) {
    throw new ProviderError(
      'anthropic',
      'SDK_MISSING',
      '@anthropic-ai/sdk is not installed. Run `npm install @anthropic-ai-sdk` to add it.',
      { cause: err },
    );
  }
}

/**
 * Implements the {@link LLMProvider} interface for Anthropic's Messages API.
 *
 * Maps between the generic ChatMessage / ToolDefinition shape used by the
 * agent runtime and the Anthropic-specific `system` + `messages` + `tools`
 * shape expected by the SDK.
 */
export class AnthropicProvider implements LLMProvider {
  public readonly name = 'anthropic';
  public readonly defaultModel: string;
  private readonly apiKey: string | undefined;
  private readonly clientFactory: (apiKey: string) => unknown;
  private cachedClient: unknown | null = null;

  constructor(options: AnthropicProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.defaultModel = options.defaultModel ?? 'claude-sonnet-4-5';
    this.clientFactory = options.clientFactory ?? ((key) => new (cachedSdk as unknown as new (opts: { apiKey: string }) => unknown)({ apiKey: key }));
  }

  private async client(): Promise<unknown> {
    if (this.cachedClient) return this.cachedClient;
    if (!this.apiKey) {
      throw new ProviderError(
        'anthropic',
        'INVALID_API_KEY',
        'No Anthropic API key provided. Set ANTHROPIC_API_KEY or pass apiKey in options.',
      );
    }
    if (!cachedSdk) await loadSdk();
    this.cachedClient = this.clientFactory(this.apiKey);
    return this.cachedClient;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResponse> {
    const client = (await this.client()) as InstanceType<AnthropicSDK>;
    const { system, rest } = splitSystemMessage(messages);

    const params: Parameters<InstanceType<AnthropicSDK>['messages']['create']>[0] = {
      model: (options.model ?? this.defaultModel) as Parameters<
        InstanceType<AnthropicSDK>['messages']['create']
      >[0]['model'],
      max_tokens: options.maxTokens ?? 4096,
      messages: rest.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    };
    if (system) (params as { system?: string }).system = system;
    if (options.temperature !== undefined) params.temperature = options.temperature;
    if (options.topP !== undefined) params.top_p = options.topP;
    if (options.stopSequences) params.stop_sequences = options.stopSequences;
    if (options.tools && options.tools.length > 0) {
      params.tools = options.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Parameters<
          InstanceType<AnthropicSDK>['messages']['create']
        >[0]['tools'] extends Array<infer U> ? (U extends { input_schema?: infer S } ? S : never) : never,
      }));
    }

    try {
      const response = await client.messages.create(params);
      return fromAnthropicResponse(response);
    } catch (err) {
      throw mapAnthropicError(err);
    }
  }

  async *stream(messages: ChatMessage[], options: ChatOptions = {}): AsyncIterable<StreamEvent> {
    const client = (await this.client()) as InstanceType<AnthropicSDK>;
    const { system, rest } = splitSystemMessage(messages);

    const params: Parameters<InstanceType<AnthropicSDK>['messages']['stream']>[0] = {
      model: (options.model ?? this.defaultModel) as Parameters<
        InstanceType<AnthropicSDK>['messages']['stream']
      >[0]['model'],
      max_tokens: options.maxTokens ?? 4096,
      messages: rest.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    };
    if (system) (params as { system?: string }).system = system;
    if (options.temperature !== undefined) params.temperature = options.temperature;
    if (options.topP !== undefined) params.top_p = options.topP;
    if (options.stopSequences) params.stop_sequences = options.stopSequences;
    if (options.tools && options.tools.length > 0) {
      params.tools = options.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Parameters<
          InstanceType<AnthropicSDK>['messages']['stream']
        >[0]['tools'] extends Array<infer U> ? (U extends { input_schema?: infer S } ? S : never) : never,
      }));
    }

    let stream;
    try {
      stream = await client.messages.stream(params);
    } catch (err) {
      yield { type: 'error', error: mapAnthropicError(err) };
      return;
    }

    let currentText = '';
    let currentTool: { id: string; name: string; input: string } | null = null;
    const tools: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    try {
      for await (const event of stream) {
        switch (event.type) {
          case 'message_start':
            yield { type: 'message_start', model: event.message.model };
            break;
          case 'content_block_start':
            if (event.content_block.type === 'text') {
              currentText = '';
              yield { type: 'text_start' };
            } else if (event.content_block.type === 'tool_use') {
              currentTool = {
                id: event.content_block.id,
                name: event.content_block.name,
                input: '',
              };
              yield {
                type: 'tool_call_start',
                id: event.content_block.id,
                name: event.content_block.name,
              };
            }
            break;
          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              currentText += event.delta.text;
              yield { type: 'text_delta', delta: event.delta.text };
            } else if (event.delta.type === 'input_json_delta' && currentTool) {
              currentTool.input += event.delta.partial_json;
              yield {
                type: 'tool_call_delta',
                id: currentTool.id,
                delta: event.delta.partial_json,
              };
            }
            break;
          case 'content_block_stop':
            if (currentText) {
              yield { type: 'text_end' };
              currentText = '';
            }
            if (currentTool) {
              let input: Record<string, unknown> = {};
              try {
                input = JSON.parse(currentTool.input || '{}') as Record<string, unknown>;
              } catch {
                input = { _raw: currentTool.input };
              }
              tools.push({ id: currentTool.id, name: currentTool.name, input });
              yield { type: 'tool_call_end', id: currentTool.id, input };
              currentTool = null;
            }
            break;
          case 'message_delta':
            // stop_reason updates mid-stream
            break;
          case 'message_stop':
            // The final usage event is emitted on message_stop.
            // We can't easily get the final usage from the streaming events
            // without listening to the message_delta event, but the SDK
            // exposes `finalMessage()` on the stream.
            break;
        }
      }

      // Get final message for usage.
      const finalMessage = await stream.finalMessage();
      yield {
        type: 'message_end',
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        },
        stopReason: finalMessage.stop_reason,
      };
    } catch (err) {
      yield { type: 'error', error: mapAnthropicError(err) };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function splitSystemMessage(messages: ChatMessage[]): { system: string; rest: ChatMessage[] } {
  const systemMessages = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  const system = systemMessages.map((m) => m.content).join('\n\n');
  return { system, rest };
}

function fromAnthropicResponse(response: unknown): ChatResponse {
  const r = response as {
    content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
    model: string;
    stop_reason: string | null;
    usage: { input_tokens: number; output_tokens: number };
  };

  let text = '';
  const toolCalls: ToolCall[] = [];
  for (const block of r.content) {
    if (block.type === 'text' && block.text) {
      text += block.text;
    } else if (block.type === 'tool_use' && block.id && block.name) {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: (block.input as Record<string, unknown>) ?? {},
      });
    }
  }

  return {
    content: text,
    toolCalls,
    usage: {
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
    },
    model: r.model,
    stopReason: r.stop_reason,
  };
}

function mapAnthropicError(err: unknown): ProviderError {
  const e = err as { status?: number; message?: string; error?: { type?: string; message?: string } };
  const status = e.status;
  const message = e.message ?? e.error?.message ?? 'Unknown Anthropic error';
  if (status === 401) return new ProviderError('anthropic', 'INVALID_API_KEY', message, { statusCode: status, cause: err });
  if (status === 429) return new ProviderError('anthropic', 'RATE_LIMITED', message, { statusCode: status, cause: err });
  if (status === 408 || status === 504) return new ProviderError('anthropic', 'TIMEOUT', message, { statusCode: status, cause: err });
  if (status === 400 && /context|token/i.test(message)) {
    return new ProviderError('anthropic', 'CONTEXT_LENGTH_EXCEEDED', message, { statusCode: status, cause: err });
  }
  if (status && status >= 500) return new ProviderError('anthropic', 'NETWORK_ERROR', message, { statusCode: status, cause: err });
  return new ProviderError('anthropic', 'UNKNOWN', message, { statusCode: status, cause: err });
}
