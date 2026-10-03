import { describe, it, expect } from 'vitest';
import { calculateEDPI, calculateCmPer360, countsToDegrees, clampPitch, yawPitchToCartesian, cartesianToYawPitch, angularDistance } from '../engine/MathEngine';

describe('MathEngine', () => {
  it('calculates eDPI correctly', () => {
    expect(calculateEDPI(800, 0.3)).toBeCloseTo(240);
  });

  it('calculates cm/360 correctly', () => {
    // 800 * 0.3 = 240 eDPI -> ~54.46 cm/360
    expect(calculateCmPer360(800, 0.3)).toBeCloseTo(54.46, 1);
  });

  it('converts counts to degrees', () => {
    expect(countsToDegrees(100, 1.0)).toBeCloseTo(6.996);
  });

  it('clamps pitch correctly', () => {
    expect(clampPitch(90)).toBe(89.5);
    expect(clampPitch(-100)).toBe(-89.5);
    expect(clampPitch(45)).toBe(45);
  });

  it('converts yaw/pitch to cartesian and back', () => {
    const yaw = 45;
    const pitch = 30;
    const { x, y, z } = yawPitchToCartesian(yaw, pitch);
    const result = cartesianToYawPitch(x, y, z);
    
    expect(result.yaw).toBeCloseTo(yaw);
    expect(result.pitch).toBeCloseTo(pitch);
  });

  it('calculates angular distance correctly', () => {
    expect(angularDistance(0, 0, 0, 90)).toBeCloseTo(90);
    expect(angularDistance(0, 0, 90, 0)).toBeCloseTo(90);
  });
});
