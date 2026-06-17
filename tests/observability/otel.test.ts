/**
 * Tests for the OpenTelemetry adapter.
 *
 * The adapter is optional — it no-ops when @opentelemetry/api is not
 * installed. These tests verify the no-op path works and the adapter
 * exports the expected types.
 */

import { describe, expect, it, vi } from 'vitest';
import { OtelAdapter } from '../../src/observability/otel.js';

describe('OtelAdapter', () => {
  it('is a class with a no-op default observer', () => {
    const a = new OtelAdapter();
    expect(a).toBeInstanceOf(OtelAdapter);
  });

  it('accepts an optional tracer', () => {
    const tracer = { startSpan: vi.fn() };
    const a = new OtelAdapter({ tracer: tracer as never });
    expect(a).toBeInstanceOf(OtelAdapter);
  });

  it('exposes a static buildObserver function', () => {
    expect(typeof OtelAdapter.buildObserver).toBe('function');
  });

  it('buildObserver returns a no-op when OTel is not installed', async () => {
    const observer = await OtelAdapter.buildObserver();
    expect(typeof observer).toBe('function');
    // Should not throw when called
    observer({ type: 'run_start', runId: 'r1', agent: 'a' });
    observer({
      type: 'run_end',
      runId: 'r1',
      result: {
        ok: true,
        steps: 0,
        finalText: '',
        toolExecutions: [],
        stopReason: 'completed',
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      },
    });
  });
});
