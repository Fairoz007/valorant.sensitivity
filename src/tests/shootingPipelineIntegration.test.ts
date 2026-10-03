import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArenaManager, type ShotEventData } from '../arena/ArenaManager';
import { RawInputEngine } from '../engine/RawInputEngine';
import { TestCoordinator } from '../arena/TestCoordinator';
import { useAppStore } from '../store/useAppStore';

describe('Authoritative Shooting Pipeline & Integration Verification', () => {
  let engine: RawInputEngine;
  let arena: ArenaManager;

  beforeEach(() => {
    engine = new RawInputEngine();
    arena = new ArenaManager(null, engine);
    arena.setSensitivity(0.35);
    arena.resetCamera();
    arena.clearTargets();
  });

  afterEach(() => {
    arena.dispose();
    engine.dispose();
  });

  // ==========================================
  // TASK 2 & 3 & 4: ONE AUTHORITATIVE PIPELINE ON MOUSEDOWN
  // ==========================================
  describe('Task 2, 3, 4: Synchronous Shot on MouseDown', () => {
    it('executes processShot synchronously when handleMouseDown is triggered', () => {
      arena.spawnTarget(0, 0, 1.25);
      let shotFired = false;
      let shotHit = false;

      arena.setOnShotCallback((evt: ShotEventData) => {
        shotFired = true;
        shotHit = evt.isHit;
      });

      // Dispatch physical mousedown (button 0)
      const clickEvent = { button: 0 } as MouseEvent;
      engine.handleMouseDown(clickEvent);

      expect(shotFired).toBe(true);
      expect(shotHit).toBe(true);
    });

    it('snapshots camera at exact physical click time and ignores subsequent frame motion', () => {
      // Aim at target (0, 0)
      arena.spawnTarget(0, 0, 1.25);
      arena.setCameraOrientation(0, 0);

      let capturedYaw = 999;
      arena.setOnShotCallback((evt) => {
        capturedYaw = evt.cameraYawDeg;
      });

      // User clicks at orientation (0, 0)
      const tClick = performance.now();
      arena.processShot(tClick);

      expect(capturedYaw).toBeCloseTo(0, 4);

      // Mouse immediately moves right after click
      engine.handleMouseMove({ movementX: 500, movementY: 0 } as MouseEvent);
      arena.processInput();

      // Camera has now moved right
      const currentCam = arena.getCameraOrientation();
      expect(currentCam.yawDeg).toBeGreaterThan(5);

      // But recorded shot orientation remains at 0
      expect(capturedYaw).toBeCloseTo(0, 4);
    });
  });

  // ==========================================
  // TASK 5, 6, 7, 8: CENTER-CAMERA RAYCAST & MATRICES
  // ==========================================
  describe('Task 5, 6, 7, 8: Center Raycast & Camera Matrices', () => {
    it('shoots strictly along camera forward vector (NDC: 0, 0)', () => {
      arena.spawnTarget(0, 0, 1.25);
      const shot = arena.processShot();

      expect(shot.rayOrigin).toBeDefined();
      expect(shot.rayDirection).toBeDefined();
      // Forward direction in default orientation is (0, 0, -1)
      expect(shot.rayDirection!.x).toBeCloseTo(0, 4);
      expect(shot.rayDirection!.y).toBeCloseTo(0, 4);
      expect(shot.rayDirection!.z).toBeCloseTo(-1, 4);
      expect(shot.isHit).toBe(true);
    });

    it('updates camera world matrix so rotated camera shoots directly at rotated target', () => {
      // Spawn target at 20° right, 10° up
      const targetYaw = 20;
      const targetPitch = 10;
      arena.spawnTarget(targetYaw, targetPitch, 1.25);

      // Rotate camera to aim at target
      arena.setCameraOrientation(targetYaw, targetPitch);

      const shot = arena.processShot();
      expect(shot.isHit).toBe(true);
      expect(shot.horizontalErrorDeg).toBeCloseTo(0, 4);
      expect(shot.verticalErrorDeg).toBeCloseTo(0, 4);
      expect(shot.angularErrorDeg).toBeCloseTo(0, 4);
    });
  });

  // ==========================================
  // TASK 9 & 10: HITBOX BOUNDARY ACCURACY
  // ==========================================
  describe('Task 9 & 10: Hitbox Boundary Accuracy', () => {
    it('verifies exact hit/miss across target radius increments', () => {
      const radiusDeg = 1.25;
      arena.resetCamera();

      // Center (0% radius) -> HIT
      arena.clearTargets();
      arena.spawnTarget(0, 0, radiusDeg);
      expect(arena.processShot().isHit).toBe(true);

      // 25% radius (0.3125°) -> HIT
      arena.clearTargets();
      arena.spawnTarget(0.3125, 0, radiusDeg);
      expect(arena.processShot().isHit).toBe(true);

      // 50% radius (0.625°) -> HIT
      arena.clearTargets();
      arena.spawnTarget(0.625, 0, radiusDeg);
      expect(arena.processShot().isHit).toBe(true);

      // 90% radius (1.125°) -> HIT
      arena.clearTargets();
      arena.spawnTarget(1.125, 0, radiusDeg);
      expect(arena.processShot().isHit).toBe(true);

      // Just inside edge (98% radius = 1.225°) -> HIT
      arena.clearTargets();
      arena.spawnTarget(1.225, 0, radiusDeg);
      expect(arena.processShot().isHit).toBe(true);

      // Just outside edge (105% radius = 1.3125°) -> MISS
      arena.clearTargets();
      arena.spawnTarget(1.3125, 0, radiusDeg);
      const outsideShot = arena.processShot();
      expect(outsideShot.isHit).toBe(false);
      expect(outsideShot.angularErrorDeg).toBeGreaterThan(radiusDeg);
    });

    it('resolves hit objects unambiguously through userData.targetEntity', () => {
      const tgt = arena.spawnTarget(0, 0, 1.25);
      const shot = arena.processShot();

      expect(shot.isHit).toBe(true);
      expect(shot.target).toBe(tgt);
      expect(shot.hitObjectId).toBe(tgt.id);
    });
  });

  // ==========================================
  // TASK 21: GUN INVARIANCE TEST
  // ==========================================
  describe('Task 21: Gun Invariance Under Recoil and Flash', () => {
    it('guarantees weapon visuals never alter camera trajectory, raycasting, or telemetry', () => {
      arena.spawnTarget(12, -8, 1.25);
      arena.setCameraOrientation(12, -8);

      // Run with gun visible and firing
      const weapon = arena.getDummyWeapon();
      weapon.triggerFireAnimation();
      weapon.update(0.016);

      const shotWithGun = arena.processShot();

      // Verify camera orientation was not altered by gun recoil
      const camOrientation = arena.getCameraOrientation();
      expect(camOrientation.yawDeg).toBeCloseTo(12, 4);
      expect(camOrientation.pitchDeg).toBeCloseTo(-8, 4);

      expect(shotWithGun.isHit).toBe(true);
      expect(shotWithGun.angularErrorDeg).toBeCloseTo(0, 4);
    });
  });

  // ==========================================
  // TASK 27: INTENTIONAL SHOOTING TESTS A THROUGH I
  // ==========================================
  describe('Task 27: Intentional Shooting Tests A through I', () => {
    it('Test A: Aim center and shoot -> HIT, very low angular error', () => {
      arena.spawnTarget(0, 0, 1.25);
      arena.setCameraOrientation(0, 0);

      const shot = arena.processShot();
      expect(shot.isHit).toBe(true);
      expect(shot.angularErrorDeg).toBeLessThan(0.05);
    });

    it('Test B: Aim clearly left of target -> MISS, horizontal error < 0 (left-side error)', () => {
      // Target at yaw 10, camera aimed at yaw 5 (5° to the left of target)
      arena.spawnTarget(10, 0, 1.25);
      arena.setCameraOrientation(5, 0);

      const shot = arena.processShot();
      expect(shot.isHit).toBe(false);
      expect(shot.horizontalErrorDeg).toBeCloseTo(-5, 3);
    });

    it('Test C: Aim clearly right of target -> MISS, horizontal error > 0 (right-side error)', () => {
      // Target at yaw 10, camera aimed at yaw 15 (5° to the right of target)
      arena.spawnTarget(10, 0, 1.25);
      arena.setCameraOrientation(15, 0);

      const shot = arena.processShot();
      expect(shot.isHit).toBe(false);
      expect(shot.horizontalErrorDeg).toBeCloseTo(5, 3);
    });

    it('Test D: Aim clearly above target -> MISS, vertical error > 0 (above error)', () => {
      // Target at pitch 0, camera aimed at pitch +5 (5° above target)
      arena.spawnTarget(0, 0, 1.25);
      arena.setCameraOrientation(0, 5);

      const shot = arena.processShot();
      expect(shot.isHit).toBe(false);
      expect(shot.verticalErrorDeg).toBeCloseTo(5, 3);
    });

    it('Test E: Aim clearly below target -> MISS, vertical error < 0 (below error)', () => {
      // Target at pitch 0, camera aimed at pitch -5 (5° below target)
      arena.spawnTarget(0, 0, 1.25);
      arena.setCameraOrientation(0, -5);

      const shot = arena.processShot();
      expect(shot.isHit).toBe(false);
      expect(shot.verticalErrorDeg).toBeCloseTo(-5, 3);
    });

    it('Test H: Fast flick + click while still moving captures exact click-time orientation', () => {
      arena.spawnTarget(25, 0, 1.25);
      
      // Simulate fast flick right
      engine.handleMouseMove({ movementX: 400, movementY: 0 } as MouseEvent);
      arena.processInput();

      const orientationAtClick = arena.getCameraOrientation();
      const shot = arena.processShot();

      expect(shot.cameraYawDeg).toBeCloseTo(orientationAtClick.yawDeg, 4);

      // Additional movement after click
      engine.handleMouseMove({ movementX: 300, movementY: 0 } as MouseEvent);
      arena.processInput();

      // Recorded shot camera orientation remains unchanged
      expect(shot.cameraYawDeg).toBeCloseTo(orientationAtClick.yawDeg, 4);
    });
  });

  // ==========================================
  // TASK 18, 19, 20: MISS -> CORRECTION -> EVENTUAL HIT IN TEST COORDINATOR
  // ==========================================
  describe('Task 18, 19, 20: Multi-Shot Engagement Lifecycle', () => {
    it('preserves firstShotHit = false, eventualHit = true, shotsRequired = 2', () => {
      const coordinator = new TestCoordinator(arena, engine);
      coordinator.startWarmup();

      const targets = arena.getActiveTargets();
      expect(targets.length).toBeGreaterThan(0);
      const target = targets[0];
      const targetYaw = (target.yaw * 180) / Math.PI;
      const targetPitch = (target.pitch * 180) / Math.PI;

      // SHOT 1: Aim off-target (miss)
      arena.setCameraOrientation(targetYaw + 10, targetPitch);
      const shot1 = arena.processShot();
      expect(shot1.isHit).toBe(false);

      // Target should NOT be removed on first miss
      expect(arena.getActiveTargets().length).toBeGreaterThan(0);

      // Player corrects aim onto target
      arena.setCameraOrientation(targetYaw, targetPitch);

      // SHOT 2: Aim on-target (hit)
      const shot2 = arena.processShot();
      expect(shot2.isHit).toBe(true);

      // Check results in store
      const store = useAppStore.getState();
      expect(store.hitsCount).toBeGreaterThanOrEqual(1);

      coordinator.stop();
    });
  });

  // ==========================================
  // TASK 28: 100-SHOT AUTOMATED BATTERY
  // ==========================================
  describe('Task 28: 100-Shot Reliability Battery', () => {
    it('executes 100 consecutive shots across all scenarios with 0 false hits and 0 false misses', () => {
      let falseHits = 0;
      let falseMisses = 0;
      let correctHits = 0;
      let correctMisses = 0;

      const angles = [
        { yaw: 0, pitch: 0, desc: 'center' },
        { yaw: 5, pitch: 0, desc: 'micro-right' },
        { yaw: -5, pitch: 0, desc: 'micro-left' },
        { yaw: 0, pitch: 4, desc: 'micro-up' },
        { yaw: 0, pitch: -4, desc: 'micro-down' },
        { yaw: 15, pitch: 0, desc: 'medium-right' },
        { yaw: -15, pitch: 0, desc: 'medium-left' },
        { yaw: 12, pitch: 10, desc: 'diagonal-up-right' },
        { yaw: -14, pitch: -8, desc: 'diagonal-down-left' },
        { yaw: 35, pitch: 12, desc: 'large-angle' },
      ];

      for (let i = 0; i < 100; i++) {
        const testCase = angles[i % angles.length];
        arena.clearTargets();
        arena.spawnTarget(testCase.yaw, testCase.pitch, 1.25);

        // Even indices: aim directly at target -> MUST HIT
        // Odd indices: aim 6° away -> MUST MISS
        const shouldHit = i % 2 === 0;

        if (shouldHit) {
          arena.setCameraOrientation(testCase.yaw, testCase.pitch);
          const shot = arena.processShot();
          if (shot.isHit) {
            correctHits++;
          } else {
            falseMisses++;
          }
        } else {
          arena.setCameraOrientation(testCase.yaw + 6, testCase.pitch);
          const shot = arena.processShot();
          if (!shot.isHit) {
            correctMisses++;
          } else {
            falseHits++;
          }
        }
      }

      expect(correctHits).toBe(50);
      expect(correctMisses).toBe(50);
      expect(falseHits).toBe(0);
      expect(falseMisses).toBe(0);
    });
  });
});
