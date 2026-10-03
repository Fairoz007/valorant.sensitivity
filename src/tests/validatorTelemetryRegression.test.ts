import { describe, expect, it } from 'vitest';
import { analyzeTrial, type TelemetryPoint } from '../engine/AimTelemetry';

const point = (timestamp: number, yaw: number, pitch = 0, v = 0): TelemetryPoint => ({ timestamp, yaw, pitch, dx: 0, dy: 0, v });

describe('independent validator telemetry regressions', () => {
  it('does not label a perfect high-pitch yaw flick an overshoot', () => {
    const points = Array.from({ length: 21 }, (_, i) => point(i*10, i, 75));
    const result = analyzeTrial(points, 20, 75, 0.85, 0, 200, false, false);
    expect(result.isValid).toBe(true);
    expect(result.endpointError).toBeCloseTo(0);
    expect(result.overshoot).toBe(0);
    expect(result.undershoot).toBe(0);
  });

  it('measures acceleration/deceleration in seconds and repairs invalid velocity', () => {
    const result = analyzeTrial([point(0, 0), point(100, 2, 0, NaN), point(200, 3), point(300, 3)], 3, 0, 0.5, 0, 300, false, false);
    expect(result.peakVelocity).toBeCloseTo(20);
    expect(result.peakAcceleration).toBeCloseTo(200);
    expect(result.peakDeceleration).toBeCloseTo(100);
    expect(result.downsampledTrajectory.every(p => Number.isFinite(p.v))).toBe(true);
  });

  it('counts a same-direction secondary push as a correction after a ballistic stop', () => {
    const result = analyzeTrial([point(0, 0), point(100, 8), point(200, 8), point(300, 10)], 10, 0, 0.5, 0, 300, false, false);
    expect(result.undershoot).toBeCloseTo(2);
    expect(result.correctionCount).toBe(1);
    expect(result.endpointError).toBeCloseTo(0);
  });
});
