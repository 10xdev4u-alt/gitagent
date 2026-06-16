/**
 * Tests for the Hono app.
 */

import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { ManifestRegistry } from '../../src/manifest/registry.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { signWebhookPayload } from '../../src/server/webhook-signature.js';
import type { ChatResponse, LLMProvider, ToolCall } from '../../src/providers/types.js';

const WEBHOOK_SECRET = 'test-secret';

function makeMockProvider(responses: ChatResponse[]): LLMProvider {
  let i = 0;
  return {
    name: 'mock',
    defaultModel: 'mock-1',
    chat: async () => {
      const r = responses[i++];
      if (!r) throw new Error('exhausted');
      return r;
    },
  };
}

function textResponse(text: string): ChatResponse {
  return { content: text, toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, model: 'mock', stopReason: 'end_turn' };
}

function makeApp(providerResponses: ChatResponse[] = [textResponse('done')]) {
  const registry = ManifestRegistry.fromMap({
    triage: `---
name: triage
triggers:
  - issues.opened
model:
  provider: anthropic
  name: claude-sonnet-4-5
---

Be concise.
`,
  });
  const providers = new ProviderRegistry();
  providers.register('anthropic', makeMockProvider(providerResponses));
  providers.register('openai', makeMockProvider(providerResponses));
  providers.register('openai-compatible', makeMockProvider(providerResponses));
  return createApp({
    webhookSecret: WEBHOOK_SECRET,
    github: { token: 'fake' },
    registry,
    providers,
  });
}

describe('GET /health', () => {
  it('returns ok with agent count', async () => {
    const app = makeApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.agents).toBe(1);
  });
});

describe('GET /agents', () => {
  it('lists all registered agents', async () => {
    const app = makeApp();
    const res = await app.request('/agents');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agents).toHaveLength(1);
    expect(body.agents[0]?.name).toBe('triage');
  });
});

describe('POST /webhook', () => {
  it('rejects without signature', async () => {
    const app = makeApp();
    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'X-GitHub-Event': 'issues' },
      body: JSON.stringify({ action: 'opened' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects with bad signature', async () => {
    const app = makeApp();
    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'X-GitHub-Event': 'issues', 'X-Hub-Signature-256': 'sha256=bad' },
      body: JSON.stringify({ action: 'opened' }),
    });
    expect(res.status).toBe(401);
  });

  it('accepts a signed webhook and runs the matching agent', async () => {
    const app = makeApp([textResponse('Triage done')]);
    const payload = JSON.stringify({
      action: 'opened',
      issue: { number: 1, title: 'bug' },
      repository: { owner: { login: 'me' }, name: 'r' },
    });
    const sig = signWebhookPayload(payload, WEBHOOK_SECRET);
    const res = await app.request('/webhook', {
      method: 'POST',
      headers: {
        'X-GitHub-Event': 'issues',
        'X-Hub-Signature-256': sig,
        'X-GitHub-Delivery': 'd-1',
        'X-GitHub-Installation-Id': '12345',
      },
      body: payload,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.matched).toBe(1);
    expect(body.results[0]?.agent).toBe('triage');
    expect(body.results[0]?.result.finalText).toBe('Triage done');
  });

  it('skips when no agents match the event', async () => {
    const app = makeApp();
    const payload = JSON.stringify({
      action: 'opened',
      repository: { owner: { login: 'me' }, name: 'r' },
    });
    const sig = signWebhookPayload(payload, WEBHOOK_SECRET);
    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'X-GitHub-Event': 'ping', 'X-Hub-Signature-256': sig },
      body: payload,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matched).toBe(0);
  });

  it('returns 400 on missing repository info', async () => {
    const app = makeApp();
    const payload = JSON.stringify({ action: 'opened' });
    const sig = signWebhookPayload(payload, WEBHOOK_SECRET);
    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'X-GitHub-Event': 'issues', 'X-Hub-Signature-256': sig },
      body: payload,
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /run/:name', () => {
  it('triggers a manual run', async () => {
    const app = makeApp([textResponse('Manual done')]);
    const res = await app.request('/run/triage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: { x: 1 }, repo: { owner: 'me', name: 'r' } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent).toBe('triage');
    expect(body.result.finalText).toBe('Manual done');
  });

  it('404 for unknown agent', async () => {
    const app = makeApp();
    const res = await app.request('/run/nope', { method: 'POST', body: '{}' });
    expect(res.status).toBe(404);
  });
});
