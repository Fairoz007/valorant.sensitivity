import { describe, expect, it } from 'vitest';
import { analyzeTrial, type TelemetryPoint } from '../engine/AimTelemetry';

function trajectory(values: [number, number, number, number?][]): TelemetryPoint[] {
  return values.map(([timestamp, yaw, pitch, v = 0]) => ({ timestamp, yaw, pitch, v, dx: yaw, dy: pitch }));
}
function analyze(points: TelemetryPoint[], yaw = 10, pitch = 0) {
  return analyzeTrial(points, yaw, pitch, 0.5, 0, points.at(-1)!.timestamp, false, false);
}

describe('clean flick segmentation', () => {
  it.each([[-10, 0, 'LEFT'], [10, 0, 'RIGHT'], [0, 10, 'UP'], [8, 6, 'UP_RIGHT']] as const)(
    'preserves directional geometry for %s/%s', (yaw, pitch, direction) => {
      const result = analyze(trajectory([[0, 0, 0], [100, yaw / 2, pitch / 2], [150, yaw, pitch]]), yaw, pitch);
      expect(result.targetDirection).toBe(direction);
      expect(result.endpointError).toBeCloseTo(0);
      expect(result.pathEfficiency).toBeGreaterThan(0.99);
      expect(result.correctionCount).toBe(0);
    });

  it('separates fast and deliberately slow accurate movements', () => {
    const fast = analyze(trajectory([[0, 0, 0], [100, 1, 0], [150, 10, 0]]));
    const slow = analyze(trajectory([[0, 0, 0], [100, 1, 0], [1150, 10, 0]]));
    expect(fast.endpointError).toBeCloseTo(slow.endpointError);
    expect(slow.movementTime).toBeGreaterThan(fast.movementTime * 10);
    expect(fast.peakVelocity).toBeGreaterThan(slow.peakVelocity);
  });

  it('captures overshoot turning point as the initial endpoint before the successful correction', () => {
    const result = analyze(trajectory([[0, 0, 0], [100, 2, 0], [150, 13, 0], [160, 12.9, 0], [200, 10, 0]]));
    expect(result.isOvershoot).toBe(true);
    expect(result.flickEndpoint.yaw).toBe(13);
    expect(result.initialFlickError).toBeCloseTo(3);
    expect(result.endpointError).toBeCloseTo(0);
    expect(result.correctionCount).toBe(1);
  });

  it('keeps the first stop when the secondary undershoot correction is faster than the initial flick', () => {
    const result = analyze(trajectory([[0, 0, 0], [100, 2, 0], [200, 6, 0], [250, 6, 0], [260, 10, 0]]));
    expect(result.isUndershoot).toBe(true);
    expect(result.undershootMagnitude).toBeCloseTo(4);
    expect(result.flickEndpoint.yaw).toBe(6);
    expect(result.correctionCount).toBe(1);
  });

  it('does not infer undershoot from a rapid click during continuous movement', () => {
    const result = analyze(trajectory([[0, 0, 0], [100, 2, 0], [110, 7, 0]]));
    expect(result.endpointError).toBeCloseTo(3);
    expect(result.isUndershoot).toBe(false);
  });

  it('ignores tiny counter-movement after a long flick', () => {
    const result = analyze(trajectory([[0, 0, 0], [100, 9.9, 0], [110, 9.87, 0], [120, 10, 0]]));
    expect(result.directionReversals).toBe(0);
    expect(result.correctionCount).toBe(0);
  });

  it('excludes pre-spawn and post-click data without modifying the saved input', () => {
    const points = trajectory([[-50, -40, 0], [0, 0, 0], [100, 2, 0], [150, 10, 0], [200, 40, 0]]);
    const original = structuredClone(points);
    const result = analyzeTrial(points, 10, 0, 0.5, 0, 150, false, false);
    expect(result.actualDistance).toBeCloseTo(10);
    expect(result.downsampledTrajectory.map(p => p.timestamp)).toEqual([0, 100, 150]);
    expect(points).toEqual(original);
  });
});
