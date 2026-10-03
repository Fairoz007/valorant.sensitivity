import { describe, it, expect } from 'vitest';
import { analyzeTrial, type TelemetryPoint } from '../engine/AimTelemetry';

describe('AimTelemetry Ground Truth Verification', () => {
  it('Case 1: Perfect straight-line horizontal hit', () => {
    const targetYaw = 10.0;
    const targetPitch = 0.0;
    const targetRadius = 1.25;
    const t0 = 1000;
    const clickTime = 1400;

    // Linear trajectory from 0 to 10 degrees over 400ms
    const points: TelemetryPoint[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      points.push({
        timestamp: t0 + frac * 400,
        dx: 0,
        dy: 0,
        yaw: frac * targetYaw,
        pitch: 0,
        v: 0,
      });
    }

    const res = analyzeTrial(points, targetYaw, targetPitch, targetRadius, t0, clickTime, false, false);

    expect(res.isValid).toBe(true);
    expect(res.idealDistance).toBeCloseTo(10.0, 3);
    expect(res.actualDistance).toBeCloseTo(10.0, 2);
    expect(res.pathEfficiency).toBeCloseTo(1.0, 2);
    expect(res.overshoot).toBe(0);
    expect(res.undershoot).toBe(0);
    expect(res.correctionCount).toBe(0);
    expect(res.endpointError).toBeCloseTo(0.0, 3);
  });

  it('Case 2: Perfect diagonal hit (3-4-5 triangle: 8° yaw, 6° pitch)', () => {
    const targetYaw = 8.0;
    const targetPitch = 6.0;
    const targetRadius = 1.25;
    const t0 = 1000;
    const clickTime = 1350;

    const points: TelemetryPoint[] = [];
    const steps = 35;
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      points.push({
        timestamp: t0 + frac * 350,
        dx: 0,
        dy: 0,
        yaw: frac * targetYaw,
        pitch: frac * targetPitch,
        v: 0,
      });
    }

    const res = analyzeTrial(points, targetYaw, targetPitch, targetRadius, t0, clickTime, false, false);

    expect(res.isValid).toBe(true);
    // Ideal diagonal distance: sqrt(8^2 + 6^2) = 10 degrees (spherical projection ~9.99°)
    expect(res.idealDistance).toBeCloseTo(10.0, 1);
    expect(res.actualDistance).toBeCloseTo(10.0, 1);
    expect(res.pathEfficiency).toBeCloseTo(1.0, 2);
    expect(res.endpointError).toBeCloseTo(0.0, 3);
  });

  it('Case 3 & 4: Overshoot detection and correction count (flick past target then correct back)', () => {
    const targetYaw = 10.0;
    const targetPitch = 0.0;
    const targetRadius = 0.85;
    const t0 = 1000;
    const clickTime = 1500;

    // Movement: 0° -> 12.5° (overshoot by 2.5°), then corrects back to 10.0°
    const points: TelemetryPoint[] = [];
    // Phase 1: 0 to 12.5° (first 300ms)
    for (let i = 0; i <= 30; i++) {
      points.push({
        timestamp: t0 + i * 10,
        dx: 0,
        dy: 0,
        yaw: (i / 30) * 12.5,
        pitch: 0,
        v: 0,
      });
    }
    // Phase 2: 12.5° back to 10.0° (next 200ms)
    for (let i = 1; i <= 20; i++) {
      points.push({
        timestamp: t0 + 300 + i * 10,
        dx: 0,
        dy: 0,
        yaw: 12.5 - (i / 20) * 2.5,
        pitch: 0,
        v: 0,
      });
    }

    const res = analyzeTrial(points, targetYaw, targetPitch, targetRadius, t0, clickTime, false, false);

    expect(res.isValid).toBe(true);
    expect(res.overshoot).toBeGreaterThan(1.0); // max was 12.5°, ideal was 10.0°
    expect(res.correctionCount).toBe(1); // 1 clear reversal from right to left
    expect(res.endpointError).toBeCloseTo(0.0, 2);
    expect(res.pathEfficiency).toBeLessThan(1.0); // actual distance = 12.5 + 2.5 = 15, ideal = 10 => ~67%
  });

  it('Case 5 & 6: Undershoot detection (primary flick stops short at 6.5°, then secondary push to 10°)', () => {
    const targetYaw = 10.0;
    const targetPitch = 0.0;
    const targetRadius = 0.85;
    const t0 = 1000;
    const clickTime = 1600;

    const points: TelemetryPoint[] = [];
    // Phase 1: Fast ballistic flick 0° -> 6.5° (peak velocity at 150ms, deceleration trough at 250ms)
    for (let i = 0; i <= 25; i++) {
      points.push({
        timestamp: t0 + i * 10,
        dx: 0,
        dy: 0,
        yaw: (i / 25) * 6.5,
        pitch: 0,
        v: 0,
      });
    }
    // Pause / deceleration trough at 6.5°
    for (let i = 1; i <= 5; i++) {
      points.push({
        timestamp: t0 + 250 + i * 10,
        dx: 0,
        dy: 0,
        yaw: 6.5,
        pitch: 0,
        v: 0,
      });
    }
    // Phase 2: Secondary corrective push from 6.5° to 10.0°
    for (let i = 1; i <= 30; i++) {
      points.push({
        timestamp: t0 + 300 + i * 10,
        dx: 0,
        dy: 0,
        yaw: 6.5 + (i / 30) * 3.5,
        pitch: 0,
        v: 0,
      });
    }

    const res = analyzeTrial(points, targetYaw, targetPitch, targetRadius, t0, clickTime, false, false);

    expect(res.isValid).toBe(true);
    expect(res.undershoot).toBeGreaterThan(1.0); // Primary flick ended short of target
    expect(res.overshoot).toBe(0);
    expect(res.endpointError).toBeCloseTo(0.0, 2);
  });

  it('Case 9: Ignores tiny high-frequency sensor noise (< 0.12° jitter)', () => {
    const targetYaw = 10.0;
    const targetPitch = 0.0;
    const targetRadius = 1.25;
    const t0 = 1000;
    const clickTime = 1400;

    const points: TelemetryPoint[] = [];
    for (let i = 0; i <= 40; i++) {
      const frac = i / 40;
      // Add +/- 0.03° micro jitter on top of progress
      const jitter = (i % 2 === 0 ? 1 : -1) * 0.03;
      points.push({
        timestamp: t0 + i * 10,
        dx: 0,
        dy: 0,
        yaw: Math.max(0, frac * targetYaw + jitter),
        pitch: 0,
        v: 0,
      });
    }

    const res = analyzeTrial(points, targetYaw, targetPitch, targetRadius, t0, clickTime, false, false);

    // Sensor jitter under 0.12° must NOT register as deliberate human directional corrections!
    expect(res.correctionCount).toBe(0);
    expect(res.isValid).toBe(true);
  });

  it('Case 10: Separates reaction latency from movement time', () => {
    const targetYaw = 10.0;
    const targetPitch = 0.0;
    const targetRadius = 1.25;
    const t0 = 1000;
    const clickTime = 1500;

    const points: TelemetryPoint[] = [];
    // User is stationary for first 150ms (timestamp 1000 to 1150)
    for (let i = 0; i <= 15; i++) {
      points.push({
        timestamp: t0 + i * 10,
        dx: 0,
        dy: 0,
        yaw: 0,
        pitch: 0,
        v: 0,
      });
    }
    // Deliberate movement starts at 1150ms and reaches target at 1500ms
    for (let i = 1; i <= 35; i++) {
      const frac = i / 35;
      points.push({
        timestamp: t0 + 150 + i * 10,
        dx: 0,
        dy: 0,
        yaw: frac * targetYaw,
        pitch: 0,
        v: 0,
      });
    }

    const res = analyzeTrial(points, targetYaw, targetPitch, targetRadius, t0, clickTime, false, false);

    expect(res.isValid).toBe(true);
    // Reaction latency should be identified around 160ms (first movement exceeding threshold)
    expect(res.reactionLatency).toBeGreaterThanOrEqual(140);
    expect(res.reactionLatency).toBeLessThanOrEqual(200);
    expect(res.movementTime).toBeCloseTo(clickTime - (t0 + res.reactionLatency), 10);
  });
});
