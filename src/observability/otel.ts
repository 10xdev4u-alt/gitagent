/**
 * OpenTelemetry adapter for the gitagent runtime.
 *
 * Bridges the runtime's `ObserverBus` events to OTel spans. Requires
 * `@opentelemetry/api` to be installed. If the SDK is not installed,
 * the adapter is a no-op.
 */

import type { RuntimeEvent, RuntimeObserver } from '../runtime/observability.js';

export interface OtelAdapterOptions {
  /** OTel tracer. If not provided, the adapter uses the global tracer. */
  tracer?: unknown;
  /** Service name for spans. */
  serviceName?: string;
}

let cachedApi: any = null;

async function loadApi(): Promise<any> {
  if (cachedApi) return cachedApi;
  try {
    // @ts-expect-error - @opentelemetry/api is an optional peer dep
    const mod = await import('@opentelemetry/api');
    cachedApi = mod;
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
          adapter.endRun(event.runId);
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
    const tracer = this.tracer as { startSpan: (name: string, options?: unknown) => unknown };
    const span = tracer.startSpan('agent.run', {
      attributes: { 'agent.name': agent, 'run.id': runId },
    });
    this.spans.set(`run:${runId}`, span);
  }

  private endRun(runId: string): void {
    const span = this.spans.get(`run:${runId}`);
    if (!span) return;
    const s = span as { setStatus: (s: unknown) => void; end: () => void };
    s.setStatus({ code: 0 });
    s.end();
    this.spans.delete(`run:${runId}`);
  }

  private startStep(runId: string, step: number): void {
    if (!this.tracer) return;
    const tracer = this.tracer as { startSpan: (name: string, options?: unknown) => unknown };
    const span = tracer.startSpan('agent.step', {
      attributes: { 'run.id': runId, 'step.number': step },
    });
    this.spans.set(`step:${runId}:${step}`, span);
  }

  private endStep(runId: string, step: number, usage: unknown): void {
    const span = this.spans.get(`step:${runId}:${step}`);
    if (!span) return;
    const s = span as { setAttribute: (k: string, v: unknown) => void; end: () => void };
    const u = usage as { inputTokens?: number; outputTokens?: number; costUsd?: number };
    if (u.inputTokens !== undefined) s.setAttribute('llm.input_tokens', u.inputTokens);
    if (u.outputTokens !== undefined) s.setAttribute('llm.output_tokens', u.outputTokens);
    if (u.costUsd !== undefined) s.setAttribute('llm.cost_usd', u.costUsd);
    s.end();
    this.spans.delete(`step:${runId}:${step}`);
  }

  private startTool(runId: string, tc: { id: string; name: string }): void {
    if (!this.tracer) return;
    const tracer = this.tracer as { startSpan: (name: string, options?: unknown) => unknown };
    const span = tracer.startSpan(`tool.${tc.name}`, {
      attributes: { 'run.id': runId, 'tool.name': tc.name, 'tool.id': tc.id },
    });
    this.spans.set(`tool:${runId}:${tc.id}`, span);
  }

  private endTool(runId: string, tc: { id: string }, ok: boolean): void {
    const span = this.spans.get(`tool:${runId}:${tc.id}`);
    if (!span) return;
    const s = span as { setStatus: (s: unknown) => void; end: () => void };
    s.setStatus({ code: ok ? 0 : 1 });
    s.end();
    this.spans.delete(`tool:${runId}:${tc.id}`);
  }
}
