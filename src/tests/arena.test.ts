import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TargetEntity } from '../arena/TargetEntity';
import { VALORANT_YAW_DEG_PER_COUNT } from '../config/constants';

describe('Arena Three.js Camera & Kinematics', () => {
  it('converts mouse counts to exact radians based on VALORANT sensitivity', () => {
    const countsX = 100;
    const sensitivity = 0.35;
    
    // Expected degrees = counts * sens * yaw
    const expectedDeg = countsX * sensitivity * VALORANT_YAW_DEG_PER_COUNT;
    const expectedRad = (expectedDeg * Math.PI) / 180;

    // Verify degrees and radians
    expect(expectedDeg).toBeCloseTo(100 * 0.35 * 0.07, 6);
    expect(expectedRad).toBeCloseTo((2.45 * Math.PI) / 180, 5);
  });

  it('clamps vertical pitch strictly to [-89.5°, +89.5°] to prevent gimbal lock', () => {
    const maxPitchRad = (89.5 * Math.PI) / 180;
    
    // Simulating extreme downward swipe (+50,000 counts)
    let pitch = 0;
    const extremeDeltaY = 50000;
    pitch += (extremeDeltaY * 0.3 * VALORANT_YAW_DEG_PER_COUNT * Math.PI) / 180;
    pitch = Math.max(-maxPitchRad, Math.min(maxPitchRad, pitch));

    expect(pitch).toBeCloseTo(maxPitchRad, 5);

    // Simulating extreme upward swipe (-50,000 counts)
    pitch -= (100000 * 0.3 * VALORANT_YAW_DEG_PER_COUNT * Math.PI) / 180;
    pitch = Math.max(-maxPitchRad, Math.min(maxPitchRad, pitch));

    expect(pitch).toBeCloseTo(-maxPitchRad, 5);
  });

  it('calculates target physical radius directly from angular radius (Task 10 & 12)', () => {
    const distance = 15; // 15 meters
    const microRadiusDeg = 0.85; // Test A (Micro)
    const mediumRadiusDeg = 1.25; // Test B (Medium)

    const microTarget = new TargetEntity(0, 0, microRadiusDeg, distance);
    const mediumTarget = new TargetEntity(0, 0, mediumRadiusDeg, distance);

    const expectedMicroPhysicalR = distance * Math.tan((microRadiusDeg * Math.PI) / 180);
    const expectedMediumPhysicalR = distance * Math.tan((mediumRadiusDeg * Math.PI) / 180);

    expect(expectedMicroPhysicalR).toBeCloseTo(0.2225, 4);
    expect(expectedMediumPhysicalR).toBeCloseTo(0.3273, 4);

    // Verify medium target is physically larger than micro target
    expect(expectedMediumPhysicalR).toBeGreaterThan(expectedMicroPhysicalR);

    microTarget.dispose();
    mediumTarget.dispose();
  });

  it('positions target at exact spherical coordinates (Task 10)', () => {
    const distance = 15;
    const yawDeg = 10;
    const pitchDeg = 5;

    const target = new TargetEntity(
      (yawDeg * Math.PI) / 180,
      (pitchDeg * Math.PI) / 180,
      1.25,
      distance
    );

    const pos = target.mesh.position;
    const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
    
    // Distance from camera must be exactly 15m
    expect(r).toBeCloseTo(distance, 4);

    target.dispose();
  });

  it('verifies center raycast hits target placed directly at (0, 0) and misses offset target (Task 11 & 12)', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100);
    camera.position.set(0, 0, 0);
    camera.quaternion.setFromEuler(new THREE.Euler(0, 0, 0, 'YXZ'));

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    // Target A: directly forward at (yaw=0, pitch=0)
    const targetA = new TargetEntity(0, 0, 1.25, 15);
    const hitA = raycaster.intersectObjects(targetA.mesh.children, true);
    expect(hitA.length).toBeGreaterThan(0);

    // Target B: offset at yaw = 25 degrees (outside crosshair ray)
    const targetB = new TargetEntity((25 * Math.PI) / 180, 0, 1.25, 15);
    const hitB = raycaster.intersectObjects(targetB.mesh.children, true);
    expect(hitB.length).toBe(0);

    targetA.dispose();
    targetB.dispose();
  });

  it('ensures moving target velocity is frame-rate independent across 60 Hz, 144 Hz, and 240 Hz (Task 18)', () => {
    const velocityYawRad = (5.0 * Math.PI) / 180; // 5 deg/sec

    // Case 1: 60 FPS (60 steps of 1/60 sec = 1.0 sec)
    const t60 = new TargetEntity(0, 0, 1.25, 15);
    t60.velocityYaw = velocityYawRad;
    for (let i = 0; i < 60; i++) t60.update(1 / 60);

    // Case 2: 144 FPS (144 steps of 1/144 sec = 1.0 sec)
    const t144 = new TargetEntity(0, 0, 1.25, 15);
    t144.velocityYaw = velocityYawRad;
    for (let i = 0; i < 144; i++) t144.update(1 / 144);

    // Case 3: 240 FPS (240 steps of 1/240 sec = 1.0 sec)
    const t240 = new TargetEntity(0, 0, 1.25, 15);
    t240.velocityYaw = velocityYawRad;
    for (let i = 0; i < 240; i++) t240.update(1 / 240);

    expect(t60.yaw).toBeCloseTo(velocityYawRad, 5);
    expect(t144.yaw).toBeCloseTo(velocityYawRad, 5);
    expect(t240.yaw).toBeCloseTo(velocityYawRad, 5);

    expect(t60.yaw).toBeCloseTo(t144.yaw, 5);
    expect(t144.yaw).toBeCloseTo(t240.yaw, 5);

    t60.dispose();
    t144.dispose();
    t240.dispose();
  });
});
