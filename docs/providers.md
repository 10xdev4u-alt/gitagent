# Providers

`gitagent` ships with LLM provider adapters for the most common
services. Each adapter implements the same `LLMProvider` interface,
so swapping providers is a one-line change in your agent config.

## Built-in providers

| Provider | Subpath | Default model |
|---|---|---|
| Anthropic | `gitagent/providers/anthropic` | `claude-sonnet-4-5` |
| OpenAI | `gitagent/providers/openai` | `gpt-4o` |
| OpenAI-compatible | `gitagent/providers/openai` | `gpt-3.5-turbo` |
| Google | (planned for v0.10) | `gemini-2.5-pro` |

## Setting a provider

In your manifest:

```yaml
model:
  provider: anthropic
  name: claude-sonnet-4-5
```

For OpenAI-compatible endpoints (Ollama, vLLM, Together, etc.):

```yaml
model:
  provider: openai-compatible
  name: llama-3-70b
  baseURL: http://localhost:11434/v1
```

For OpenAI proper:

```yaml
model:
  provider: openai
  name: gpt-4o
```

## Environment variables

Each provider reads its API key from a different env var:

| Provider | Env var |
|---|---|
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| OpenAI-compatible | `OPENAI_API_KEY` + `OPENAI_BASE_URL` |
| Google | `GOOGLE_API_KEY` (planned) |

You can also pass the key explicitly:

```ts
const provider = new AnthropicProvider({ apiKey: 'sk-ant-...' });
```

## Adding a new provider

See [CONTRIBUTING.md](../CONTRIBUTING.md) and the Husk provider
guide for the step-by-step. The TL;DR:

1. Implement `LLMProvider`
2. Translate to/from the provider's API
3. Map errors to `ProviderError`
4. Register in `ProviderRegistry`
5. Add tests
6. Update docs

## Provider-agnostic features

Every provider supports:
- **Chat completions** (`chat()`)
- **Tool calling** (via the `tools` option)
- **Streaming** (via `stream()` — where supported)
- **Usage tracking** (input + output tokens)
- **Error mapping** (rate limits, auth, network, etc.)

Provider-specific features (function calling format, system
prompt format, etc.) are abstracted away.

## The provider interface

```ts
interface LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  stream?(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<StreamEvent>;
}
```

If you need a feature that's not in this interface, the right
answer is usually to add it to the interface (and implement it
for all providers), not to add a provider-specific escape hatch.

## Why so many providers?

Because LLM users are not monolithic. Some prefer Claude for
code. Some prefer GPT-4o for chat. Some need local Ollama for
privacy. Some need Together or Groq for speed.

The goal: you can switch providers without changing your agent
code. The agent's manifest declares the provider; the runtime
loads the right one.

If you need a provider that doesn't exist, the contribution
guide walks you through adding it. The whole ecosystem gets
better every time someone adds a provider.
