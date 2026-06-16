/**
 * Tests for the provider registry.
 */

import { describe, expect, it } from 'vitest';
import { ProviderRegistry } from '../../src/providers/registry.js';

describe('ProviderRegistry', () => {
  it('registers and retrieves a provider', () => {
    const r = new ProviderRegistry();
    const fake = { name: 'fake', defaultModel: 'fake-1' } as never;
    r.register('fake', fake);
    expect(r.get('fake')).toBe(fake);
    expect(r.list()).toEqual(['fake']);
  });

  it('require throws when not registered', () => {
    const r = new ProviderRegistry();
    expect(() => r.require('nope')).toThrow();
  });

  it('withDefaults registers anthropic, openai, openai-compatible', () => {
    const r = ProviderRegistry.withDefaults();
    expect(r.get('anthropic')?.name).toBe('anthropic');
    expect(r.get('openai')?.name).toBe('openai');
    expect(r.get('openai-compatible')?.name).toBe('openai-compatible');
  });

  it('forModel picks the right provider', () => {
    const r = ProviderRegistry.withDefaults();
    expect(r.forModel({ provider: 'anthropic' }).name).toBe('anthropic');
    expect(r.forModel({ provider: 'openai' }).name).toBe('openai');
    expect(r.forModel({ provider: 'openai-compatible' }).name).toBe('openai-compatible');
  });
});
