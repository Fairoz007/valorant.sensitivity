import { describe, it, expect } from 'vitest';
import { analyzeTrial, type TelemetryPoint } from '../engine/AimTelemetry';
import { generateBatteryTargets } from '../engine/TargetGenerator';

describe('TargetGenerator', () => {
  it('generates deterministic targets based on seed', () => {
    const targets1 = generateBatteryTargets(12345, 'micro', 5);
    const targets2 = generateBatteryTargets(12345, 'micro', 5);
    
    expect(targets1.length).toBe(5);
    expect(targets1).toEqual(targets2);
  });

  it('generates proper displacements for scenarios', () => {
    const targets = generateBatteryTargets(1, 'large', 1);
    const t = targets[0];
    const dist = Math.sqrt(t.yaw**2 + t.pitch**2);
    // Allowing slight floating point imprecision
    expect(dist).toBeGreaterThanOrEqual(24.9);
    expect(dist).toBeLessThanOrEqual(55.1);
  });
});

describe('AimTelemetry', () => {
  it('analyzes a trial correctly', () => {
    const points: TelemetryPoint[] = [];
    
    // Target appeared at 0
    points.push({ timestamp: 0, dx: 0, dy: 0, yaw: 0, pitch: 0, v: 0 });
    
    // Reaction latency starts around 100ms (needs dist > 0.15 and v > 6)
    points.push({ timestamp: 100, dx: 10, dy: 0, yaw: 0.2, pitch: 0, v: 10 });
    
    // Acceleration burst (overshoots)
    points.push({ timestamp: 120, dx: 50, dy: 0, yaw: 3.5, pitch: 0, v: 50 });
    
    // First local minimum -> primary flick end
    points.push({ timestamp: 140, dx: 10, dy: 0, yaw: 3.6, pitch: 0, v: 5 });
    
    // Corrects back
    points.push({ timestamp: 160, dx: -2, dy: 0, yaw: 2.5, pitch: 0, v: 1 });
    
    // Settles at click
    points.push({ timestamp: 180, dx: 1, dy: 0, yaw: 2.35, pitch: 0, v: 2 });
    
    const targetYaw = 2.35;
    const targetPitch = 0;
    const targetRadius = 0.85;

    const result = analyzeTrial(points, targetYaw, targetPitch, targetRadius, 0, 180, false, false);
    
    expect(result.isValid).toBe(true);
    expect(result.reactionLatency).toBe(100);
    expect(result.movementTime).toBe(80); // 180 - 100
    expect(result.overshoot).toBeGreaterThan(0);
  });
});
