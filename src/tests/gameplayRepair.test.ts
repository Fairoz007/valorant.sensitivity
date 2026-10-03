import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ArenaManager } from '../arena/ArenaManager';
import { RawInputEngine } from '../engine/RawInputEngine';
import { TargetEntity } from '../arena/TargetEntity';

describe('Gameplay repair: real input → camera → shot', () => {
  let engine: RawInputEngine;
  let arena: ArenaManager;
  beforeEach(() => {
    engine = new RawInputEngine();
    arena = new ArenaManager(null, engine);
  });
  afterEach(() => { arena.dispose(); engine.dispose(); vi.unstubAllGlobals(); });

  it.each([[0.15, 10.5], [0.20, 14], [0.25, 17.5], [0.30, 21], [0.40, 28], [0.60, 42]])(
    'sensitivity %s applies 1000 counts as %s degrees before click and samples', (sensitivity, degrees) => {
      arena.setSensitivity(sensitivity);
      engine.startTrialCapture();
      let recordedYaw = 0;
      engine.subscribeSample(sample => { recordedYaw = sample.cameraYaw; });
      arena.spawnTarget(degrees, 0, 1.25);
      engine.handleMouseMove({ movementX: 1000, movementY: 0, timeStamp: 10 } as MouseEvent);
      expect(recordedYaw).toBeCloseTo(degrees, 8);
      expect(arena.getCameraOrientation().yawDeg).toBeCloseTo(degrees, 8);
      let hit = false;
      arena.setOnShotCallback(shot => { hit = shot.isHit; });
      engine.handleMouseDown({ button: 0, timeStamp: 11 } as MouseEvent);
      expect(hit).toBe(true);
      arena.processInput();
      expect(arena.getCameraOrientation().yawDeg).toBeCloseTo(degrees, 8);
      expect(engine.endTrialCapture().samples[0].cameraYaw).toBeCloseTo(degrees, 8);
    }
  );

  it('shot buffer excludes post-click timestamp and retains it for the next input pass', () => {
    // Buffer injection models the frame-lag queue, independent of browser delivery order.
    const buffered = engine as unknown as { deltas: { timestamp: number; dx: number; dy: number }[] };
    arena.setSensitivity(0.2);
    buffered.deltas = [{ timestamp: 20, dx: 500, dy: 0 }, { timestamp: 10, dx: 1000, dy: 0 }];
    arena.spawnTarget(14, 0, 1.25);
    expect(arena.processShot(15).isHit).toBe(true);
    expect(arena.getCameraOrientation().yawDeg).toBeCloseTo(14, 8);
    arena.processInput();
    expect(arena.getCameraOrientation().yawDeg).toBeCloseTo(21, 8);
  });

  it('shot excludes future hardware timestamps even if movement was delivered before mousedown', () => {
    arena.setSensitivity(0.2);
    engine.startTrialCapture();
    engine.handleMouseMove({ movementX: 500, movementY: 0, timeStamp: 20 } as MouseEvent);
    engine.handleMouseMove({ movementX: 1000, movementY: 0, timeStamp: 10 } as MouseEvent);
    arena.spawnTarget(14, 0, 1.25);
    const shot = arena.processShot(15);
    expect(shot.isHit).toBe(true);
    expect(shot.cameraYawDeg).toBeCloseTo(14, 8);
    expect(arena.getCameraOrientation().yawDeg).toBeCloseTo(21, 8);
    expect(engine.endTrialCapture(15).samples[0].cameraYaw).toBeCloseTo(14, 8);
  });

  it('callbacks see old target removed and can create a fresh target without disposal', () => {
    const old = arena.spawnTarget(0, 0, 1.25, 0, 0, 'old');
    const dispose = vi.spyOn(old, 'dispose');
    arena.setOnShotCallback(() => {
      expect(arena.getActiveTargets()).toHaveLength(0);
      arena.clearTargets();
      arena.spawnTarget(0, 0, 1.25, 0, 0, 'next');
    });
    arena.processShot();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(arena.getActiveTargets()[0].id).toBe('next');
  });

  it('pause rejects physical motion and shots, then resumes with no stale counts', () => {
    arena.setSensitivity(0.2);
    arena.spawnTarget(0, 0);
    let shots = 0;
    arena.setOnShotCallback(() => shots++);
    arena.setPaused(true);
    engine.handleMouseMove({ movementX: 1000, movementY: 0 } as MouseEvent);
    engine.handleMouseDown({ button: 0 } as MouseEvent);
    expect(shots).toBe(0);
    expect(arena.getCameraOrientation().yawDeg).toBeCloseTo(0);
    arena.setPaused(false);
    arena.processInput();
    engine.handleMouseDown({ button: 0 } as MouseEvent);
    expect(shots).toBe(1);
  });

  it.each([0, 0.25, 0.5, 0.9, 0.999])('visible disk radius fraction %s hits including debug mode', fraction => {
    arena.setDebugMode(true);
    arena.spawnTarget(0, 0, 1.25);
    // Use an angle halfway between polygon vertices: catches coarse hitbox facets.
    const radialAngle = Math.PI / 256;
    const radius = 15 * Math.tan(THREE.MathUtils.degToRad(1.25)) * fraction;
    const direction = new THREE.Vector3(radius * Math.cos(radialAngle), radius * Math.sin(radialAngle), -15).normalize();
    arena.setCameraOrientation(THREE.MathUtils.radToDeg(Math.atan2(direction.x, -direction.z)), THREE.MathUtils.radToDeg(Math.asin(direction.y)));
    expect(arena.processShot().isHit).toBe(true);
  });

  it('just outside visible disk misses and retains target for correction', () => {
    arena.setDebugMode(true);
    arena.spawnTarget(0, 0, 1.25);
    arena.setCameraOrientation(1.251, 0);
    expect(arena.processShot().isHit).toBe(false);
    expect(arena.getActiveTargets()).toHaveLength(1);
    arena.setCameraOrientation(0, 0);
    expect(arena.processShot().isHit).toBe(true);
  });

  it('weapon fire and debug overlays leave the camera and ray invariant', () => {
    arena.setCameraOrientation(13, -7);
    const before = arena.processShot();
    arena.setDebugMode(true);
    arena.getDummyWeapon().triggerFireAnimation();
    arena.getDummyWeapon().update(0.05);
    const after = arena.processShot();
    expect(after.rayOrigin).toEqual(before.rayOrigin);
    expect(after.rayDirection).toEqual(before.rayDirection);
    expect(after.cameraYawDeg).toEqual(before.cameraYawDeg);
    expect(after.cameraPitchDeg).toEqual(before.cameraPitchDeg);
  });

  it('stationary alignment diagnostic excludes shots from trials and repeats its target', () => {
    let scoredShots = 0;
    const changes: boolean[] = [];
    arena.setOnShotCallback(() => scoredShots++);
    arena.setOnDiagnosticModeCallback(enabled => changes.push(enabled));
    arena.setAlignmentCheck(true);
    expect(arena.getActiveTargets()[0].radiusDeg).toBe(5);
    expect(arena.processShot().isHit).toBe(true);
    expect(arena.processShot().isHit).toBe(true);
    expect(scoredShots).toBe(0);
    expect(arena.getActiveTargets()).toHaveLength(1);
    arena.setAlignmentCheck(false);
    expect(changes).toEqual([true, false]);
    expect(arena.getActiveTargets()).toHaveLength(0);
  });

  it('severe stalls restart active locked trials but do not punish deliberate pause', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(engine, 'isLocked').mockReturnValue(true);
    const stalled = vi.fn();
    arena.setOnFrameStallCallback(stalled);
    arena.start();
    now += 300;
    const render = arena as unknown as { animate(): void };
    render.animate();
    expect(stalled).toHaveBeenCalledWith(300);
    expect(arena.getFrameStallCount()).toBe(1);
    arena.setPaused(true);
    now += 500;
    render.animate();
    expect(stalled).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('tracking reflects consistently and remains reachable even after long misses', () => {
    const sixty = new TargetEntity(0, 0, 1.25);
    const fast = new TargetEntity(0, 0, 1.25);
    for (const target of [sixty, fast]) {
      target.velocityYaw = THREE.MathUtils.degToRad(5);
      target.velocityPitch = THREE.MathUtils.degToRad(-3);
    }
    for (let i = 0; i < 60 * 120; i++) sixty.update(1 / 60);
    for (let i = 0; i < 240 * 120; i++) fast.update(1 / 240);
    expect(sixty.yaw).toBeCloseTo(fast.yaw, 8);
    expect(sixty.pitch).toBeCloseTo(fast.pitch, 8);
    expect(Math.abs(THREE.MathUtils.radToDeg(sixty.yaw))).toBeLessThanOrEqual(12.000001);
    expect(Math.abs(THREE.MathUtils.radToDeg(sixty.pitch))).toBeLessThanOrEqual(8.000001);
    sixty.dispose(); fast.dispose();
  });

  it.each([0, 300].flatMap(yaw => [-70, 70].flatMap(pitch => [16 / 9, 9 / 16].map(aspect => [yaw, pitch, aspect]))))(
    'full target disk stays projected inside viewport at yaw %s pitch %s aspect %s', (yaw, pitch, aspect) => {
      const camera = (arena as unknown as { camera: THREE.PerspectiveCamera }).camera;
      camera.aspect = aspect;
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(103 / 2)) / aspect));
      camera.updateProjectionMatrix();
      arena.setCameraOrientation(yaw, pitch);
      for (const [plannedYaw, plannedPitch] of [[55, 0], [0, 20], [30, 20], [-55, -20], [0, -55], [55, 55], [2, -2]]) {
        const offset = arena.getVisibilitySafeOffset(plannedYaw, plannedPitch, 1.6);
        const target = arena.spawnTarget(yaw + offset.yaw, pitch + offset.pitch, 1.6);
        expect(Math.abs(THREE.MathUtils.radToDeg(target.pitch))).toBeLessThanOrEqual(85.000001);
        const physicalRadius = target.distance * Math.tan(THREE.MathUtils.degToRad(target.radiusDeg));
        for (let vertex = 0; vertex < 128; vertex++) {
          const theta = vertex * Math.PI * 2 / 128;
          const projected = target.mesh.localToWorld(new THREE.Vector3(Math.cos(theta) * physicalRadius, Math.sin(theta) * physicalRadius, 0)).project(camera);
          expect(Math.abs(projected.x)).toBeLessThan(1);
          expect(Math.abs(projected.y)).toBeLessThan(1);
          expect(projected.z).toBeGreaterThan(-1);
          expect(projected.z).toBeLessThan(1);
        }
        arena.clearTargets();
      }
    }
  );

  it('timestamp-limited capture excludes later physical counts as well as samples', () => {
    engine.startTrialCapture();
    engine.handleMouseMove({ movementX: 8, movementY: -6, timeStamp: 20 } as MouseEvent);
    engine.handleMouseMove({ movementX: -3, movementY: 4, timeStamp: 10 } as MouseEvent);
    const capture = engine.endTrialCapture(15);
    expect(capture.samples).toHaveLength(1);
    expect(capture.samples[0].timestamp).toBe(10);
    expect(capture.counts).toEqual({ totalRightCounts: 0, totalLeftCounts: 3, netHorizontalCounts: -3,
      absoluteHorizontalTravel: 3, totalUpCounts: 0, totalDownCounts: 4, netVerticalCounts: 4,
      absoluteVerticalTravel: 4, totalRawVectorTravel: 5 });
  });
});
