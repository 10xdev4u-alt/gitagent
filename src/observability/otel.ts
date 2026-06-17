/**
 * OpenTelemetry adapter for the gitagent runtime.
 *
 * Bridges the runtime's `ObserverBus` events to OTel spans. Requires
 * `@opentelemetry/api` and `@opentelemetry/sdk-node` to be installed.
 * If the SDK is not installed, the adapter is a no-op.
 */

import type { RuntimeEvent, RuntimeObserver } from '../runtime/observability.js';

export interface OtelAdapterOptions {
  /** OTel tracer. If not provided, the adapter is a no-op. */
  tracer?: unknown;
  /** Service name for spans. */
  serviceName?: string;
}

let cachedApi: typeof import('@opentelemetry/api') | null = null;

async function loadApi(): Promise<typeof import('@opentelemetry/api') | null> {
  if (cachedApi) return cachedApi;
  try {
    cachedApi = await import('@opentelemetry/api');
    return cachedApi;
  } catch {
    return null;
  }
}

export class OtelAdapter {
  private readonly tracer: unknown | null;
  private readonly spans = new Map<string, unknown>();

  constructor(options: OtelAdapterOptions = {}) {
    this.tracer = options.tracer ?? null;
  }

  /** Build a RuntimeObserver that emits OTel spans. */
  static async buildObserver(options: OtelAdapterOptions = {}): Promise<RuntimeObserver> {
    const adapter = new OtelAdapter(options);
    const api = await loadApi();
    if (!api) {
      // No-op observer if OTel isn't installed.
      return () => {};
    }
    const tracerName = options.serviceName ?? 'gitagent';
    const tracer = options.tracer ?? api.trace.getTracer(tracerName);

    return (event: RuntimeEvent) => {
      switch (event.type) {
        case 'run_start':
          adapter.startRun(event.runId, event.agent);
          break;
        case 'run_end':
          adapter.endRun(event.runId, event.result);
          break;
        case 'step_start':
          adapter.startStep(event.runId, event.step);
          break;
        case 'step_end':
          adapter.endStep(event.runId, event.step, event.usage);
          break;
        case 'tool_call_start':
          adapter.startTool(event.runId, event.toolCall);
          break;
        case 'tool_call_end':
          adapter.endTool(event.runId, event.toolCall, event.ok);
          break;
      }
    };
  }

  private startRun(runId: string, agent: string): void {
    if (!this.tracer) return;
    const span = (this.tracer as { startSpan: (name: string, options?: unknown) => unknown }).startSpan(
      `agent.run`,
      { attributes: { 'agent.name': agent, 'run.id': runId } },
    );
    this.spans.set(`run:${runId}`, span);
  }

  private endRun(runId: string, result: unknown): void {
    const span = this.spans.get(`run:${runId}`);
    if (!span) return;
    (span as { setStatus: (s: unknown) => void }).setStatus({ code: 0 });
    (span as { end: () => void }).end();
    this.spans.delete(`run:${runId}`);
  }

  private startStep(runId: string, step: number): void {
    if (!this.tracer) return;
    const span = (this.tracer as { startSpan: (name: string, options?: unknown) => unknown }).startSpan(
      `agent.step`,
      { attributes: { 'run.id': runId, 'step.number': step } },
    );
    this.spans.set(`step:${runId}:${step}`, span);
  }

  private endStep(runId: string, step: number, usage: unknown): void {
    const span = this.spans.get(`step:${runId}:${step}`);
    if (!span) return;
    const u = usage as { inputTokens?: number; outputTokens?: number; costUsd?: number };
    if (u.inputTokens) (span as { setAttribute: (k: string, v: unknown) => void }).setAttribute('llm.input_tokens', u.inputTokens);
    if (u.outputTokens) (span as { setAttribute: (k: string, v: unknown) => void }).setAttribute('llm.output_tokens', u.outputTokens);
    if (u.costUsd) (span as { setAttribute: (k: string, v: unknown) => void }).setAttribute('llm.cost_usd', u.costUsd);
    (span as { end: () => void }).end();
    this.spans.delete(`step:${runId}:${step}`);
  }

  private startTool(runId: string, tc: { id: string; name: string }): void {
    if (!this.tracer) return;
    const span = (this.tracer as { startSpan: (name: string, options?: unknown) => unknown }).startSpan(
      `tool.${tc.name}`,
      { attributes: { 'run.id': runId, 'tool.name': tc.name, 'tool.id': tc.id } },
    );
    this.spans.set(`tool:${runId}:${tc.id}`, span);
  }

  private endTool(runId: string, tc: { id: string }, ok: boolean): void {
    const span = this.spans.get(`tool:${runId}:${tc.id}`);
    if (!span) return;
    (span as { setStatus: (s: unknown) => void }).setStatus({ code: ok ? 0 : 1 });
    (span as { end: () => void }).end();
    this.spans.delete(`tool:${runId}:${tc.id}`);
  }
}
