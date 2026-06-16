/**
 * The LLM provider interface.
 *
 * All providers (Anthropic, OpenAI, OpenAI-compatible, etc.) implement this
 * contract. The agent runtime talks only to this interface; the concrete
 * provider is selected at startup based on the manifest's `model` block.
 */

/** A single chat message. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Optional name (for multi-party conversations). */
  name?: string;
}

/** A tool definition in OpenAI / Anthropic shape. */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema describing the tool's input. */
  inputSchema: Record<string, unknown>;
}

/** A tool call requested by the model. */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Token usage reported by the provider. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Total cost in USD, if computable. */
  costUsd?: number;
}

/** Options for a chat call. */
export interface ChatOptions {
  /** Model name (overrides the provider default). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  tools?: ToolDefinition[];
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

/** Response from a non-streaming chat call. */
export interface ChatResponse {
  content: string;
  toolCalls: ToolCall[];
  usage: TokenUsage;
  /** The model that actually produced the response. */
  model: string;
  /** Stop reason (end_turn, tool_use, max_tokens, etc). */
  stopReason: string | null;
}

/** A streaming event from the provider. */
export type StreamEvent =
  | { type: 'message_start'; model: string }
  | { type: 'text_start' }
  | { type: 'text_delta'; delta: string }
  | { type: 'text_end' }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_delta'; id: string; delta: string }
  | { type: 'tool_call_end'; id: string; input: Record<string, unknown> }
  | { type: 'message_end'; usage: TokenUsage; stopReason: string | null }
  | { type: 'error'; error: Error };

/** The provider interface. */
export interface LLMProvider {
  /** Provider name (matches ModelProvider enum). */
  readonly name: string;
  /** Default model name. */
  readonly defaultModel: string;
  /** Chat completion (non-streaming). */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  /** Streaming chat completion. Optional — providers without streaming throw. */
  stream?(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<StreamEvent>;
}
