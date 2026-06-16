/**
 * The provider registry.
 *
 * Maps {@link ModelProvider} enum values to concrete {@link LLMProvider}
 * instances. Allows tests to inject mock providers and allows the agent
 * runtime to look up the right provider for a manifest's `model.provider`
 * field.
 */

import { AnthropicProvider, type AnthropicProviderOptions } from './anthropic.js';
import { OpenAIProvider, type OpenAIProviderOptions } from './openai.js';
import type { LLMProvider } from './types.js';
import type { ModelProvider as ModelProviderName } from '../manifest/schema.js';

export interface ProviderFactoryOptions {
  anthropic?: AnthropicProviderOptions;
  openai?: OpenAIProviderOptions;
  openaiCompatible?: OpenAIProviderOptions;
}

export class ProviderRegistry {
  private readonly providers: Map<string, LLMProvider> = new Map();

  /** Register a provider under a name. */
  register(name: string, provider: LLMProvider): void {
    this.providers.set(name, provider);
  }

  /** Look up a provider by name. */
  get(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  /** Get a provider, throwing if not registered. */
  require(name: string): LLMProvider {
    const p = this.providers.get(name);
    if (!p) throw new Error(`No provider registered for "${name}"`);
    return p;
  }

  /** List registered provider names. */
  list(): string[] {
    return Array.from(this.providers.keys());
  }

  /** Build a default registry with Anthropic + OpenAI + OpenAI-compatible. */
  static withDefaults(options: ProviderFactoryOptions = {}): ProviderRegistry {
    const registry = new ProviderRegistry();
    registry.register('anthropic', new AnthropicProvider(options.anthropic ?? {}));
    registry.register('openai', new OpenAIProvider({ ...(options.openai ?? {}), providerName: 'openai' }));
    if (options.openaiCompatible) {
      registry.register('openai-compatible', new OpenAIProvider({ ...options.openaiCompatible, providerName: 'openai-compatible' }));
    } else {
      // Always register a default openai-compatible for env-var based endpoints
      registry.register('openai-compatible', new OpenAIProvider({ providerName: 'openai-compatible' }));
    }
    return registry;
  }

  /** Build a provider for a manifest's model block. */
  forModel(model: { provider: ModelProviderName; baseURL?: string }): LLMProvider {
    if (model.provider === 'openai-compatible') {
      return this.require('openai-compatible');
    }
    return this.require(model.provider);
  }
}
