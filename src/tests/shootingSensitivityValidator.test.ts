import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { RawInputEngine } from '../engine/RawInputEngine';
import { ArenaManager } from '../arena/ArenaManager';
import { analyzeTrial, classifyTargetDirection, type TelemetryPoint } from '../engine/AimTelemetry';
import { SensitivityOptimizer } from '../sensitivity/SensitivityOptimizer';
import { generateExplanation } from '../sensitivity/ExplanationGenerator';
import { generateBalancedCandidateBattery } from '../engine/TargetGenerator';
import { VALORANT_YAW_DEG_PER_COUNT } from '../config/constants';

/**
 * SHOOTING-SENSITIVITY-VALIDATOR Pipeline (Tasks 1 - 60)
 * Automated ground truth and regression verification test suite for the complete
 * shooting-based sensitivity measurement engine.
 */
describe('SHOOTING-SENSITIVITY-VALIDATOR Pipeline', () => {
  let engine: RawInputEngine;
  let arena: ArenaManager;

  beforeEach(() => {
    engine = new RawInputEngine();
    arena = new ArenaManager(null, engine);
  });

  afterEach(() => {
    arena.dispose();
    engine.dispose();
  });

  // ==========================================
  // TASK 1, 2, 3, 4: RAW HARDWARE INPUT & COUNTS
  // ==========================================
  describe('Raw Mouse Input & Directional Counting (Tasks 1–4)', () => {
    it('captures raw X and Y movement without cursor coordinates (Task 1)', () => {
      engine.startTrialCapture();
      engine.handleMouseMove({ movementX: 15, movementY: -8 } as MouseEvent);

      const { samples } = engine.endTrialCapture();
      expect(samples.length).toBe(1);
      expect(samples[0].dx).toBe(15);
      expect(samples[0].dy).toBe(-8);
      expect(samples[0].accumulatedX).toBe(15);
      expect(samples[0].accumulatedY).toBe(-8);
    });

    it('accumulates left and right counts with net horizontal travel (Task 2)', () => {
      engine.startTrialCapture();
      // Right flick (+12, +18, +21) followed by left correction (-4, -7)
      const horizontalSequence = [12, 18, 21, 16, -4, -7];
      for (const dx of horizontalSequence) {
        engine.handleMouseMove({ movementX: dx, movementY: 0 } as MouseEvent);
      }

      const { counts } = engine.endTrialCapture();
      expect(counts.totalRightCounts).toBe(12 + 18 + 21 + 16); // 67
      expect(counts.totalLeftCounts).toBe(4 + 7);               // 11
      expect(counts.netHorizontalCounts).toBe(67 - 11);         // 56
      expect(counts.absoluteHorizontalTravel).toBe(67 + 11);    // 78
    });

    it('accumulates up and down counts with net vertical travel (Task 3)', () => {
      engine.startTrialCapture();
      // Up flick (negative dy in browser: -15, -25) then down correction (+5)
      engine.handleMouseMove({ movementX: 0, movementY: -15 } as MouseEvent);
      engine.handleMouseMove({ movementX: 0, movementY: -25 } as MouseEvent);
      engine.handleMouseMove({ movementX: 0, movementY: 5 } as MouseEvent);

      const { counts } = engine.endTrialCapture();
      expect(counts.totalUpCounts).toBe(40);
      expect(counts.totalDownCounts).toBe(5);
      expect(counts.absoluteVerticalTravel).toBe(45);
    });

    it('calculates compound 2D vector travel sqrt(dx² + dy²) (Task 4)', () => {
      engine.startTrialCapture();
      // 3-4-5 triangle: dx=30, dy=40 -> vector length 50
      engine.handleMouseMove({ movementX: 30, movementY: 40 } as MouseEvent);

      const { counts } = engine.endTrialCapture();
      expect(counts.totalRawVectorTravel).toBeCloseTo(50, 4);
    });
  });

  // ==========================================
  // TASK 5, 7, 30: CAMERA ROTATION & CENTER RAYCAST
  // ==========================================
  describe('Camera Kinematics & Center-Screen Shooting (Tasks 5, 7, 30)', () => {
    it('scales camera yaw and pitch strictly by VALORANT_YAW without DPI multiplication (Task 5)', () => {
      arena.setSensitivity(0.35);

      // dx = 100 counts right
      engine.handleMouseMove({ movementX: 100, movementY: 0 } as MouseEvent);
      arena.processInput();

      const cam = arena.getCameraOrientation();
      const expectedYawDeg = 100 * 0.35 * VALORANT_YAW_DEG_PER_COUNT;
      expect(cam.yawDeg).toBeCloseTo(expectedYawDeg, 4);
      expect(cam.pitchDeg).toBeCloseTo(0, 4);
    });

    it('ensures pitch moves upward (positive) when dy is negative (Task 5)', () => {
      arena.setSensitivity(0.40);

      // dy = -50 (upward mouse push)
      engine.handleMouseMove({ movementX: 0, movementY: -50 } as MouseEvent);
      arena.processInput();

      const cam = arena.getCameraOrientation();
      const expectedPitchDeg = -(-50) * 0.40 * VALORANT_YAW_DEG_PER_COUNT;
      expect(cam.pitchDeg).toBeCloseTo(expectedPitchDeg, 4);
      expect(cam.pitchDeg).toBeGreaterThan(0);
    });

    it('verifies candidate sensitivity actually changes camera response proportionally (Task 41)', () => {
      arena.resetCamera();
      arena.setSensitivity(0.20);
      engine.handleMouseMove({ movementX: 100, movementY: 0 } as MouseEvent);
      arena.processInput();
      const yawLow = arena.getCameraOrientation().yawDeg;

      arena.resetCamera();
      arena.setSensitivity(0.40);
      engine.handleMouseMove({ movementX: 100, movementY: 0 } as MouseEvent);
      arena.processInput();
      const yawHigh = arena.getCameraOrientation().yawDeg;

      // 0.40 sensitivity must produce exactly 2x rotation compared to 0.20 sensitivity
      expect(yawHigh).toBeCloseTo(yawLow * 2, 4);
    });

    it('shoots strictly from camera center (0, 0) and records hit/miss (Task 30, 31, 33)', () => {
      arena.resetCamera();
      // Target placed at (0, 0)
      arena.spawnTarget(0, 0, 1.25);
      const hitEvent = arena.executeShot();

      expect(hitEvent.isHit).toBe(true);
      expect(hitEvent.angularErrorDeg).toBeCloseTo(0, 4);

      // Target offset to +15° (outside crosshair center)
      arena.clearTargets();
      arena.spawnTarget(15, 0, 1.25);
      const missEvent = arena.executeShot();

      expect(missEvent.isHit).toBe(false);
      expect(missEvent.angularErrorDeg).toBeCloseTo(15, 3);
      expect(missEvent.horizontalErrorDeg).toBeCloseTo(-15, 3);
    });
  });

  // ==========================================
  // TASK 6 & 55: DUMMY WEAPON INVARIANT (VISUAL ONLY)
  // ==========================================
  describe('Dummy Weapon Visual Invariant (Task 6 & Task 55)', () => {
    it('verifies dummy weapon exists, animates, kicks, and flashes', () => {
      const weapon = arena.getDummyWeapon();
      expect(weapon).toBeDefined();
      expect(weapon.mesh).toBeInstanceOf(THREE.Group);

      // Trigger fire animation
      weapon.triggerFireAnimation();
      weapon.update(0.016);
      expect(weapon.mesh.position.z).not.toBe(0);
    });

    it('PROVES dummy weapon NEVER influences camera orientation, raycasting, or hit detection', () => {
      arena.resetCamera();
      arena.spawnTarget(0, 0, 1.25);

      const camBefore = { ...arena.getCameraOrientation() };

      // Execute shot (triggers weapon recoil kick, flash, sway)
      const shotResult = arena.executeShot();

      const camAfter = arena.getCameraOrientation();

      // Camera orientation must NOT be mutated by gun recoil
      expect(camAfter.yawDeg).toBe(camBefore.yawDeg);
      expect(camAfter.pitchDeg).toBe(camBefore.pitchDeg);

      // Hit result must be genuine center hit
      expect(shotResult.isHit).toBe(true);
      expect(shotResult.angularErrorDeg).toBe(0);
    });
  });

  // ==========================================
  // TASK 13, 14, 15, 16: DIRECTIONAL ANALYSIS
  // ==========================================
  describe('Directional Classification & Performance (Tasks 13, 14, 15, 16)', () => {
    it('accurately classifies all 8 cardinal and diagonal sectors', () => {
      expect(classifyTargetDirection(15, 0)).toBe('RIGHT');
      expect(classifyTargetDirection(-15, 0)).toBe('LEFT');
      expect(classifyTargetDirection(0, 10)).toBe('UP');
      expect(classifyTargetDirection(0, -10)).toBe('DOWN');
      expect(classifyTargetDirection(10, 10)).toBe('UP_RIGHT');
      expect(classifyTargetDirection(-10, 10)).toBe('UP_LEFT');
      expect(classifyTargetDirection(10, -10)).toBe('DOWN_RIGHT');
      expect(classifyTargetDirection(-10, -10)).toBe('DOWN_LEFT');
    });

    it('separately tracks LEFT vs RIGHT flick performance (Task 14)', () => {
      const cand = SensitivityOptimizer.createCandidate('c_test', 'Block A', 0.30, 1.0);

      // 5 Left flicks with high precision
      for (let i = 0; i < 5; i++) {
        cand.trials.push({
          id: `t_left_${i}`,
          candidateId: cand.id,
          candidateSens: 0.30,
          scenario: 'medium',
          targetId: `tgt_l_${i}`,
          isValid: true,
          targetDirection: 'LEFT',
          targetYawDelta: -12,
          targetPitchDelta: 0,
          totalAngularDistance: 12,
          targetRadiusDeg: 1.25,
          rawCounts: {} as any,
          targetSpawnTime: 0,
          movementStartTime: 150,
          shotTime: 450,
          reactionLatencyMs: 150,
          movementTimeMs: 300,
          totalAcquisitionTimeMs: 450,
          peakVelocityDegPerSec: 60,
          timeToPeakVelocityMs: 100,
          stoppingControlScore: 90,
          firstFlickEndpointDeg: { yaw: -12, pitch: 0 },
          initialFlickErrorDeg: 0.1,
          isOvershoot: false,
          overshootMagnitudeDeg: 0,
          overshootPercentage: 0,
          isUndershoot: false,
          undershootMagnitudeDeg: 0,
          undershootPercentage: 0,
          correctionCount: 0,
          directionReversals: 0,
          idealDistanceDeg: 12,
          actualPathDistanceDeg: 12.2,
          pathEfficiency: 0.98,
          horizontalEndpointErrorDeg: 0.1,
          verticalEndpointErrorDeg: 0,
          totalEndpointErrorDeg: 0.1,
          isHit: true,
          firstShotHit: true,
          eventualHit: true,
          shotsRequired: 1,
          trajectorySummary: [],
          targetPosDeg: { yaw: -12, pitch: 0, radius: 1.25 },
          startPosDeg: { yaw: 0, pitch: 0 },
          clickPosDeg: { yaw: -11.9, pitch: 0 },
        });
      }

      // 5 Right flicks with overshoots and corrections
      for (let i = 0; i < 5; i++) {
        cand.trials.push({
          id: `t_right_${i}`,
          candidateId: cand.id,
          candidateSens: 0.30,
          scenario: 'medium',
          targetId: `tgt_r_${i}`,
          isValid: true,
          targetDirection: 'RIGHT',
          targetYawDelta: 12,
          targetPitchDelta: 0,
          totalAngularDistance: 12,
          targetRadiusDeg: 1.25,
          rawCounts: {} as any,
          targetSpawnTime: 0,
          movementStartTime: 150,
          shotTime: 520,
          reactionLatencyMs: 150,
          movementTimeMs: 370,
          totalAcquisitionTimeMs: 520,
          peakVelocityDegPerSec: 75,
          timeToPeakVelocityMs: 120,
          stoppingControlScore: 60,
          firstFlickEndpointDeg: { yaw: 14.5, pitch: 0 },
          initialFlickErrorDeg: 2.5,
          isOvershoot: true,
          overshootMagnitudeDeg: 2.5,
          overshootPercentage: 20.8,
          isUndershoot: false,
          undershootMagnitudeDeg: 0,
          undershootPercentage: 0,
          correctionCount: 2,
          directionReversals: 2,
          idealDistanceDeg: 12,
          actualPathDistanceDeg: 15.5,
          pathEfficiency: 0.77,
          horizontalEndpointErrorDeg: 0.4,
          verticalEndpointErrorDeg: 0,
          totalEndpointErrorDeg: 0.4,
          isHit: true,
          firstShotHit: false,
          eventualHit: true,
          shotsRequired: 2,
          trajectorySummary: [],
          targetPosDeg: { yaw: 12, pitch: 0, radius: 1.25 },
          startPosDeg: { yaw: 0, pitch: 0 },
          clickPosDeg: { yaw: 12.4, pitch: 0 },
        });
      }

      SensitivityOptimizer.computeCandidateScore(cand);

      expect(cand.directionalAnalysis.left.firstShotAccuracyRate).toBe(1.0);
      expect(cand.directionalAnalysis.right.firstShotAccuracyRate).toBe(0.0);
      expect(cand.directionalAnalysis.right.overshootRate).toBe(1.0);
      expect(cand.directionalAnalysis.left.overshootRate).toBe(0.0);
      expect(cand.directionalAnalysis.left.score).toBeGreaterThan(cand.directionalAnalysis.right.score);
    });
  });

  // ==========================================
  // TASK 35–39: TARGET SCENARIOS (Micro, Med, Large, Switching, Tracking)
  // ==========================================
  describe('Target Scenarios (Tasks 35–39)', () => {
    it('generates balanced candidate battery containing all scenario types', () => {
      const battery = generateBalancedCandidateBattery(999);
      expect(battery.length).toBeGreaterThanOrEqual(11);

      const micro = battery.filter((t) => t.scenario === 'micro');
      const medium = battery.filter((t) => t.scenario === 'medium');
      const large = battery.filter((t) => t.scenario === 'large');
      const switching = battery.filter((t) => t.scenario === 'switching');
      const tracking = battery.filter((t) => t.scenario === 'tracking');

      expect(micro.length).toBe(3);
      expect(medium.length).toBe(4);
      expect(large.length).toBe(2);
      expect(switching.length).toBe(3);
      expect(tracking.length).toBe(1);

      // Verify angular ranges
      micro.forEach((t) => {
        const d = Math.hypot(t.yaw, t.pitch);
        expect(d).toBeGreaterThanOrEqual(1.0);
        expect(d).toBeLessThanOrEqual(4.5);
      });

      medium.forEach((t) => {
        const d = Math.hypot(t.yaw, t.pitch);
        expect(d).toBeGreaterThanOrEqual(8.0);
        expect(d).toBeLessThanOrEqual(21.0);
      });

      large.forEach((t) => {
        const d = Math.hypot(t.yaw, t.pitch);
        expect(d).toBeGreaterThanOrEqual(25.0);
        expect(d).toBeLessThanOrEqual(55.0);
      });
    });
  });

  // ==========================================
  // TASK 57: MANUAL VALIDATION ARCHETYPES
  // ==========================================
  describe('Manual Validation Behavior Archetypes (Task 57)', () => {
    // 10 Clean Flicks
    it('distinguishes 10 clean flicks (high efficiency, 0 overshoot, 0 undershoot, 0 corrections)', () => {
      for (let i = 0; i < 10; i++) {
        const targetYaw = 8.0 + i * 0.5;
        const points: TelemetryPoint[] = [];
        for (let s = 0; s <= 20; s++) {
          points.push({
            timestamp: 1000 + s * 15,
            dx: 5,
            dy: 0,
            yaw: (s / 20) * targetYaw,
            pitch: 0,
            v: 30,
          });
        }
        const res = analyzeTrial(points, targetYaw, 0, 1.25, 1000, 1300, false, false);
        expect(res.isOvershoot).toBe(false);
        expect(res.isUndershoot).toBe(false);
        expect(res.correctionCount).toBe(0);
        expect(res.pathEfficiency).toBeGreaterThan(0.95);
      }
    });

    // 10 Overshoots
    it('distinguishes 10 overshoots (passed beyond target, overshoot = true, magnitude > 0)', () => {
      for (let i = 0; i < 10; i++) {
        const targetYaw = 10.0;
        const overYaw = 12.0 + i * 0.3; // Passed beyond target
        const points: TelemetryPoint[] = [];
        for (let s = 0; s <= 15; s++) {
          points.push({
            timestamp: 1000 + s * 15,
            dx: 6,
            dy: 0,
            yaw: (s / 15) * overYaw,
            pitch: 0,
            v: 45,
          });
        }
        for (let s = 1; s <= 8; s++) {
          points.push({
            timestamp: 1225 + s * 15,
            dx: -2,
            dy: 0,
            yaw: overYaw - (s / 8) * (overYaw - targetYaw),
            pitch: 0,
            v: 15,
          });
        }
        const res = analyzeTrial(points, targetYaw, 0, 1.25, 1000, 1345, false, false);
        expect(res.isOvershoot).toBe(true);
        expect(res.overshootMagnitude).toBeGreaterThan(0.5);
      }
    });

    // 10 Undershoots
    it('distinguishes 10 undershoots (stalled short of target, undershoot = true)', () => {
      for (let i = 0; i < 10; i++) {
        const targetYaw = 12.0;
        const stallYaw = 7.0 + i * 0.2; // Stalled short
        const points: TelemetryPoint[] = [];
        // Fast flick 1
        for (let s = 0; s <= 12; s++) {
          points.push({
            timestamp: 1000 + s * 15,
            dx: 4,
            dy: 0,
            yaw: (s / 12) * stallYaw,
            pitch: 0,
            v: 35,
          });
        }
        // Stalling trough
        for (let s = 1; s <= 4; s++) {
          points.push({
            timestamp: 1180 + s * 15,
            dx: 0,
            dy: 0,
            yaw: stallYaw,
            pitch: 0,
            v: 0,
          });
        }
        // Secondary push
        for (let s = 1; s <= 10; s++) {
          points.push({
            timestamp: 1240 + s * 15,
            dx: 2,
            dy: 0,
            yaw: stallYaw + (s / 10) * (targetYaw - stallYaw),
            pitch: 0,
            v: 18,
          });
        }
        const res = analyzeTrial(points, targetYaw, 0, 1.25, 1000, 1390, false, false);
        expect(res.isUndershoot).toBe(true);
        expect(res.undershootMagnitude).toBeGreaterThan(1.0);
      }
    });

    // 10 Slow Precise vs 10 Fast Inaccurate
    it('distinguishes slow precise movements from fast inaccurate movements', () => {
      // Slow precise: movementTime > 500ms, endpointError ≈ 0
      const slowPoints: TelemetryPoint[] = [];
      for (let s = 0; s <= 40; s++) {
        slowPoints.push({
          timestamp: 1000 + s * 20,
          dx: 1,
          dy: 0,
          yaw: (s / 40) * 10,
          pitch: 0,
          v: 12,
        });
      }
      const slowRes = analyzeTrial(slowPoints, 10, 0, 1.25, 1000, 1800, false, false);
      expect(slowRes.movementTime).toBeGreaterThanOrEqual(500);
      expect(slowRes.endpointError).toBeCloseTo(0, 2);

      // Fast inaccurate: movementTime < 200ms, endpointError > 2.0
      const fastPoints: TelemetryPoint[] = [];
      for (let s = 0; s <= 10; s++) {
        fastPoints.push({
          timestamp: 1000 + s * 15,
          dx: 12,
          dy: 0,
          yaw: (s / 10) * 13.5, // missed 10° by 3.5°
          pitch: 0,
          v: 85,
        });
      }
      const fastRes = analyzeTrial(fastPoints, 10, 0, 1.25, 1000, 1150, false, false);
      expect(fastRes.movementTime).toBeLessThanOrEqual(200);
      expect(fastRes.endpointError).toBeGreaterThan(2.0);
    });

    // 10 Left vs 10 Right vs 10 Vertical vs 10 Diagonal
    it('correctly tracks and distinguishes directional sets (10 left, 10 right, 10 vertical, 10 diagonal)', () => {
      for (let i = 0; i < 10; i++) {
        expect(classifyTargetDirection(-10 - i, 0)).toBe('LEFT');
        expect(classifyTargetDirection(10 + i, 0)).toBe('RIGHT');
        expect(classifyTargetDirection(0, 10 + i)).toBe('UP');
        expect(classifyTargetDirection(0, -10 - i)).toBe('DOWN');
        expect(classifyTargetDirection(8 + i, 8 + i)).toBe('UP_RIGHT');
        expect(classifyTargetDirection(-8 - i, -8 - i)).toBe('DOWN_LEFT');
      }
    });

    // 10 Multiple-Correction Shots
    it('detects multiple corrections (>= 2 reversals along trajectory)', () => {
      for (let i = 0; i < 10; i++) {
        const points: TelemetryPoint[] = [];
        // Right to 12°
        for (let s = 0; s <= 10; s++) points.push({ timestamp: 1000 + s * 15, dx: 4, dy: 0, yaw: (s / 10) * 12, pitch: 0, v: 30 });
        // Left correction back to 9°
        for (let s = 1; s <= 6; s++) points.push({ timestamp: 1150 + s * 15, dx: -2, dy: 0, yaw: 12 - (s / 6) * 3, pitch: 0, v: 20 });
        // Right correction to 10°
        for (let s = 1; s <= 5; s++) points.push({ timestamp: 1240 + s * 15, dx: 1, dy: 0, yaw: 9 + (s / 5) * 1, pitch: 0, v: 15 });

        const res = analyzeTrial(points, 10, 0, 1.25, 1000, 1315, false, false);
        expect(res.correctionCount).toBeGreaterThanOrEqual(2);
      }
    });
  });

  // ==========================================
  // TASK 58: GROUND-TRUTH DETERMINISTIC TRAJECTORIES
  // ==========================================
  describe('Ground-Truth Trajectory Telemetry (Task 58)', () => {
    it('Ground Truth 1: Clean perfect flick (0° -> +10°)', () => {
      const points: TelemetryPoint[] = [];
      const t0 = 1000;
      for (let i = 0; i <= 20; i++) {
        points.push({
          timestamp: t0 + i * 20,
          dx: 5,
          dy: 0,
          yaw: (i / 20) * 10,
          pitch: 0,
          v: 25,
        });
      }

      const res = analyzeTrial(points, 10, 0, 1.25, t0, t0 + 400, false, false);
      expect(res.isValid).toBe(true);
      expect(res.endpointError).toBeCloseTo(0, 3);
      expect(res.isOvershoot).toBe(false);
      expect(res.isUndershoot).toBe(false);
      expect(res.pathEfficiency).toBeCloseTo(1.0, 2);
    });

    it('Ground Truth 2: Overshoot with reversal correction (0° -> +13.5° -> +10°)', () => {
      const points: TelemetryPoint[] = [];
      const t0 = 1000;
      for (let i = 0; i <= 15; i++) {
        points.push({
          timestamp: t0 + i * 20,
          dx: 8,
          dy: 0,
          yaw: (i / 15) * 13.5,
          pitch: 0,
          v: 45,
        });
      }
      for (let i = 1; i <= 10; i++) {
        points.push({
          timestamp: t0 + 300 + i * 20,
          dx: -3,
          dy: 0,
          yaw: 13.5 - (i / 10) * 3.5,
          pitch: 0,
          v: 15,
        });
      }

      const res = analyzeTrial(points, 10, 0, 1.25, t0, t0 + 500, false, false);
      expect(res.isValid).toBe(true);
      expect(res.isOvershoot).toBe(true);
      expect(res.overshootMagnitude).toBeGreaterThan(2.0);
      expect(res.correctionCount).toBeGreaterThanOrEqual(1);
    });

    it('Ground Truth 3: Undershoot stalling short (0° -> 6.5° pause -> 10°)', () => {
      const points: TelemetryPoint[] = [];
      const t0 = 1000;
      for (let i = 0; i <= 15; i++) {
        points.push({
          timestamp: t0 + i * 20,
          dx: 4,
          dy: 0,
          yaw: (i / 15) * 6.5,
          pitch: 0,
          v: 30,
        });
      }
      for (let i = 1; i <= 3; i++) {
        points.push({
          timestamp: t0 + 300 + i * 20,
          dx: 0,
          dy: 0,
          yaw: 6.5,
          pitch: 0,
          v: 0,
        });
      }
      for (let i = 1; i <= 10; i++) {
        points.push({
          timestamp: t0 + 360 + i * 20,
          dx: 3,
          dy: 0,
          yaw: 6.5 + (i / 10) * 3.5,
          pitch: 0,
          v: 18,
        });
      }

      const res = analyzeTrial(points, 10, 0, 1.25, t0, t0 + 560, false, false);
      expect(res.isValid).toBe(true);
      expect(res.isUndershoot).toBe(true);
      expect(res.undershootMagnitude).toBeGreaterThan(1.5);
    });

    it('Ground Truth 4: Vertical flick up (pitch 0° -> +12°)', () => {
      const points: TelemetryPoint[] = [];
      const t0 = 1000;
      for (let i = 0; i <= 20; i++) {
        points.push({
          timestamp: t0 + i * 20,
          dx: 0,
          dy: -4,
          yaw: 0,
          pitch: (i / 20) * 12,
          v: 30,
        });
      }
      const res = analyzeTrial(points, 0, 12, 1.25, t0, t0 + 400, false, false);
      expect(res.isValid).toBe(true);
      expect(res.targetDirection).toBe('UP');
      expect(res.endpointError).toBeCloseTo(0, 3);
    });

    it('Ground Truth 5: Compound diagonal flick (yaw 0° -> +12°, pitch 0° -> +9°)', () => {
      const points: TelemetryPoint[] = [];
      const t0 = 1000;
      for (let i = 0; i <= 20; i++) {
        points.push({
          timestamp: t0 + i * 20,
          dx: 5,
          dy: -3.75,
          yaw: (i / 20) * 12,
          pitch: (i / 20) * 9,
          v: 37.5,
        });
      }
      const res = analyzeTrial(points, 12, 9, 1.25, t0, t0 + 400, false, false);
      expect(res.isValid).toBe(true);
      expect(res.targetDirection).toBe('UP_RIGHT');
      expect(res.idealDistance).toBeCloseTo(15.0, 1); // 3-4-5 triangle: 12, 9, 15
      expect(res.pathEfficiency).toBeCloseTo(1.0, 2);
    });
  });

  // ==========================================
  // TASK 42, 50, 51, 52: FULL ADAPTIVE SEARCH & REPORT
  // ==========================================
  describe('Full End-to-End Search Optimization (Tasks 42, 50, 51, 52)', () => {
    it('executes full adaptive stages: Coarse -> Bracketing -> Fine -> Confirmation', () => {
      const s0 = 0.30;

      // 1. Coarse
      const p1 = SensitivityOptimizer.generatePhase1Candidates(s0);
      expect(p1.length).toBe(5);

      // Simulate trials for p1 with optimum around 0.28
      p1.forEach((cand) => {
        const delta = Math.abs(cand.sens - 0.28);
        for (let i = 0; i < 8; i++) {
          cand.trials.push({
            id: `t_${cand.id}_${i}`,
            candidateId: cand.id,
            candidateSens: cand.sens,
            scenario: 'medium',
            targetId: `tgt_${i}`,
            isValid: true,
            targetDirection: i % 2 === 0 ? 'LEFT' : 'RIGHT',
            targetYawDelta: 10,
            targetPitchDelta: 0,
            totalAngularDistance: 10,
            targetRadiusDeg: 1.25,
            rawCounts: {} as any,
            targetSpawnTime: 0,
            movementStartTime: 160,
            shotTime: 400 + delta * 300,
            reactionLatencyMs: 160,
            movementTimeMs: 240 + delta * 300,
            totalAcquisitionTimeMs: 400 + delta * 300,
            peakVelocityDegPerSec: 65,
            timeToPeakVelocityMs: 110,
            stoppingControlScore: Math.max(30, 95 - delta * 150),
            firstFlickEndpointDeg: { yaw: 10, pitch: 0 },
            initialFlickErrorDeg: delta * 2,
            isOvershoot: cand.sens > 0.28 && delta > 0.03,
            overshootMagnitudeDeg: cand.sens > 0.28 ? delta * 3 : 0,
            overshootPercentage: cand.sens > 0.28 ? delta * 30 : 0,
            isUndershoot: cand.sens < 0.28 && delta > 0.03,
            undershootMagnitudeDeg: cand.sens < 0.28 ? delta * 3 : 0,
            undershootPercentage: cand.sens < 0.28 ? delta * 30 : 0,
            correctionCount: delta > 0.04 ? 2 : 0,
            directionReversals: delta > 0.04 ? 2 : 0,
            idealDistanceDeg: 10,
            actualPathDistanceDeg: 10 + delta * 5,
            pathEfficiency: Math.max(0.6, 1.0 - delta * 1.2),
            horizontalEndpointErrorDeg: delta * 0.5,
            verticalEndpointErrorDeg: 0,
            totalEndpointErrorDeg: delta * 0.5,
            isHit: delta < 0.08,
            firstShotHit: delta < 0.05,
            eventualHit: true,
            shotsRequired: delta > 0.05 ? 2 : 1,
            trajectorySummary: [],
            targetPosDeg: { yaw: 10, pitch: 0, radius: 1.25 },
            startPosDeg: { yaw: 0, pitch: 0 },
            clickPosDeg: { yaw: 10, pitch: 0 },
          });
        }
      });

      const rankedP1 = SensitivityOptimizer.rankCandidates(p1);
      const winnerP1 = rankedP1[0];
      expect(winnerP1).toBeDefined();

      // 2. Bracketing
      const p2 = SensitivityOptimizer.generatePhase2Candidates(rankedP1);
      expect(p2.length).toBe(3);

      // 3. Fine Search
      const p3 = SensitivityOptimizer.generatePhase3Candidates(p2);
      expect(p3.length).toBe(3);

      // 4. Confirmation
      const p4 = SensitivityOptimizer.generatePhase4Candidates(winnerP1.sens);
      expect(p4.length).toBe(3);

      // Verify explanation cites actual telemetry
      const explanation = generateExplanation(0.30, 0.285, {
        overshootTendency: 'Moderate',
        undershootTendency: 'Low',
        avgCorrections: 1.1,
        medianAcquisitionMs: 380,
        medianMovementMs: 220,
        pathEfficiencyPct: 94.2,
        hitAccuracyPct: 96,
        firstShotAccuracyPct: 92,
      });

      expect(explanation).toContain('0.285');
      expect(explanation).toContain('94.2%');
      expect(explanation).toContain('overshooting');
    });
  });
});
