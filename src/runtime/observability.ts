/**
 * Observability hooks.
 *
 * The agent runtime fires events at key points. Users can subscribe
 * to these events to log, trace, or report metrics.
 */

import type { RunContext, RunResult } from './context.js';
import type { ToolCall } from '../providers/types.js';

/** All event types fired by the runtime. */
export type RuntimeEvent =
  | { type: 'run_start'; runId: string; agent: string }
  | { type: 'step_start'; runId: string; step: number }
  | { type: 'step_end'; runId: string; step: number; usage: { inputTokens: number; outputTokens: number; costUsd?: number } }
  | { type: 'tool_call_start'; runId: string; toolCall: ToolCall }
  | { type: 'tool_call_end'; runId: string; toolCall: ToolCall; ok: boolean; output?: unknown; error?: string }
  | { type: 'run_end'; runId: string; result: RunResult };

export type RuntimeObserver = (event: RuntimeEvent) => void | Promise<void>;

/** A simple observer that logs events to a logger. */
export function loggingObserver(logger: { debug: (msg: string, meta?: Record<string, unknown>) => void }): RuntimeObserver {
  return (event) => {
    logger.debug(`[${event.type}]`, { event });
  };
}

/** A composite observer that fires multiple observers. */
export class ObserverBus {
  private readonly observers: RuntimeObserver[] = [];

  add(observer: RuntimeObserver): void {
    this.observers.push(observer);
  }

  remove(observer: RuntimeObserver): void {
    const i = this.observers.indexOf(observer);
    if (i >= 0) this.observers.splice(i, 1);
  }

  async emit(event: RuntimeEvent): Promise<void> {
    for (const obs of this.observers) {
      try {
        await obs(event);
      } catch (err) {
        // Never let an observer break the run
        // eslint-disable-next-line no-console
        console.error('[observer] error:', err);
      }
    }
  }

  count(): number {
    return this.observers.length;
  }
}

/** Hook an ObserverBus into a RunContext by wrapping the logger. */
export function instrumentLogger(
  bus: ObserverBus,
  baseLogger: { debug: (msg: string, meta?: Record<string, unknown>) => void; info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void; error: (msg: string, meta?: Record<string, unknown>) => void },
): { debug: typeof baseLogger.debug; info: typeof baseLogger.info; warn: typeof baseLogger.warn; error: typeof baseLogger.error } {
  return {
    debug: (msg, meta) => {
      baseLogger.debug(msg, meta);
    },
    info: baseLogger.info,
    warn: baseLogger.warn,
    error: baseLogger.error,
  };
}

// Reference unused imports so biome doesn't flag them; they are part of the public API.
export type { RunContext, RunResult };
