/**
 * Tests for the observer bus.
 */

import { describe, expect, it, vi } from 'vitest';
import { loggingObserver, ObserverBus } from '../../src/runtime/observability.js';

describe('ObserverBus', () => {
  it('emits events to all observers', async () => {
    const bus = new ObserverBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.add(a);
    bus.add(b);
    await bus.emit({ type: 'run_start', runId: 'r1', agent: 'test' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('removes observers', async () => {
    const bus = new ObserverBus();
    const a = vi.fn();
    bus.add(a);
    bus.remove(a);
    await bus.emit({ type: 'run_start', runId: 'r1', agent: 'test' });
    expect(a).not.toHaveBeenCalled();
  });

  it('does not break if an observer throws', async () => {
    const bus = new ObserverBus();
    const a = vi.fn(() => {
      throw new Error('boom');
    });
    const b = vi.fn();
    bus.add(a);
    bus.add(b);
    // Suppress console.error during this test
    const origErr = console.error;
    console.error = () => {};
    try {
      await bus.emit({ type: 'run_start', runId: 'r1', agent: 'test' });
    } finally {
      console.error = origErr;
    }
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  it('counts observers', () => {
    const bus = new ObserverBus();
    expect(bus.count()).toBe(0);
    bus.add(() => {});
    bus.add(() => {});
    expect(bus.count()).toBe(2);
  });
});

describe('loggingObserver', () => {
  it('returns a function that logs to the provided logger', () => {
    const logger = { debug: vi.fn() };
    const obs = loggingObserver(logger);
    obs({ type: 'run_start', runId: 'r1', agent: 'test' });
    expect(logger.debug).toHaveBeenCalledWith('[run_start]', { event: { type: 'run_start', runId: 'r1', agent: 'test' } });
  });
});
