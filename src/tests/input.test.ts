import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RawInputEngine } from '../engine/RawInputEngine';

describe('RawInputEngine', () => {
  let engine: RawInputEngine;

  beforeEach(() => {
    engine = new RawInputEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  it('records mouse movement deltas and debug stats', () => {
    // Simulate mouse moves
    engine.handleMouseMove({ movementX: -6, movementY: 2 } as MouseEvent);
    engine.handleMouseMove({ movementX: 10, movementY: -4 } as MouseEvent);

    const stats = engine.getDebugStats();
    expect(stats.totalEvents).toBe(2);
    expect(stats.lastDx).toBe(10);
    expect(stats.lastDy).toBe(-4);
    expect(stats.accumulatedX).toBe(4); // -6 + 10 = 4
    expect(stats.accumulatedY).toBe(-2); // 2 + -4 = -2

    const deltas = engine.getDeltas();
    expect(deltas.length).toBe(2);
    expect(deltas[0].dx).toBe(-6);
    expect(deltas[0].dy).toBe(2);
    expect(deltas[1].dx).toBe(10);
    expect(deltas[1].dy).toBe(-4);

    // Delta buffer must be cleared after reading
    expect(engine.getDeltas().length).toBe(0);
  });

  it('supports subscriber callbacks for delta processing', () => {
    const received: { dx: number; dy: number }[] = [];
    const unsubscribe = engine.subscribeDelta((dx, dy) => {
      received.push({ dx, dy });
    });

    engine.handleMouseMove({ movementX: 5, movementY: -3 } as MouseEvent);
    engine.handleMouseMove({ movementX: -2, movementY: 8 } as MouseEvent);

    expect(received.length).toBe(2);
    expect(received[0]).toEqual({ dx: 5, dy: -3 });
    expect(received[1]).toEqual({ dx: -2, dy: 8 });

    unsubscribe();
    engine.handleMouseMove({ movementX: 1, movementY: 1 } as MouseEvent);
    expect(received.length).toBe(2);
  });

  it('records left mouse button clicks and allows consumption', () => {
    let clickNotified = 0;
    engine.subscribeClick(() => {
      clickNotified++;
    });

    // Primary left button (0)
    engine.handleMouseDown({ button: 0 } as MouseEvent);
    expect(clickNotified).toBe(1);

    // Secondary button (1) should not count as primary aim click
    engine.handleMouseDown({ button: 1 } as MouseEvent);
    expect(clickNotified).toBe(1);

    expect(engine.consumeClicks()).toBe(1);
    expect(engine.consumeClicks()).toBe(0);
  });

  it('measures event polling rate within sliding 1-second window', () => {
    for (let i = 0; i < 20; i++) {
      engine.handleMouseMove({ movementX: 1, movementY: 1 } as MouseEvent);
    }
    expect(engine.getPollingRate()).toBe(20);
  });
});
