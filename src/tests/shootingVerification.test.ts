import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArenaManager } from '../arena/ArenaManager';
import { RawInputEngine } from '../engine/RawInputEngine';
import { VALORANT_YAW_DEG_PER_COUNT } from '../config/constants';
import * as THREE from 'three';

describe('Click-time shooting isolation', () => {
  let engine: RawInputEngine;
  let arena: ArenaManager;
  beforeEach(() => { engine = new RawInputEngine(); arena = new ArenaManager(null, engine); });
  afterEach(() => { arena.dispose(); engine.dispose(); vi.restoreAllMocks(); });

  it('removes the target before callbacks and ignores gap clicks as measurements', () => {
    const target = arena.spawnTarget(0, 0);
    const callback = vi.fn(() => {
      expect(target.isHitState).toBe(true);
      expect(target.mesh.visible).toBe(false);
      expect(target.mesh.parent).toBeNull();
      expect(arena.getActiveTargets()).toHaveLength(0);
      // A reentrant click cannot close or hit the same trial twice.
      expect(arena.processShot(21).isHit).toBe(false);
    });
    arena.setOnShotCallback(callback);
    expect(arena.processShot(20).isHit).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
    arena.processShot(22);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('uses eligible input at click time even if later input was dispatched first', () => {
    arena.setSensitivity(1);
    const counts = 10 / VALORANT_YAW_DEG_PER_COUNT;
    arena.spawnTarget(10, 0);
    engine.startTrialCapture();
    engine.handleMouseMove({ movementX: counts, movementY: 0, timeStamp: 10 } as MouseEvent);
    engine.handleMouseMove({ movementX: counts, movementY: 0, timeStamp: 30 } as MouseEvent);
    let capture: ReturnType<RawInputEngine['endTrialCapture']> | undefined;
    arena.setOnShotCallback(event => { capture = engine.endTrialCapture(event.shotTimestamp); });
    const shot = arena.processShot(20);
    expect(shot.isHit).toBe(true);
    expect(shot.cameraYawDeg).toBeCloseTo(10);
    expect(shot.rayDirection!.x).toBeCloseTo(Math.sin(Math.PI / 18));
    expect(arena.getCameraOrientation().yawDeg).toBeCloseTo(20);
    expect(capture!.samples.map(sample => sample.timestamp)).toEqual([10]);
    expect(capture!.counts.totalRawVectorTravel).toBeCloseTo(counts);
  });

  it('keeps a miss active for correction and a second shot', () => {
    const target = arena.spawnTarget(10, 5);
    const recorded: boolean[] = [];
    arena.setOnShotCallback(event => recorded.push(event.isHit));
    expect(arena.processShot(10).isHit).toBe(false);
    expect(arena.getActiveTargets()).toContain(target);
    arena.setCameraOrientation(10, 5);
    expect(arena.processShot(20).isHit).toBe(true);
    expect(recorded).toEqual([false, true]);
  });

  it('preserves the visible outer polygon boundary rather than enlarging its hitbox', () => {
    const target = arena.spawnTarget(0, 0, 1.25);
    const radius = target.distance * Math.tan(THREE.MathUtils.degToRad(target.radiusDeg));
    const angle = Math.PI / 256;
    const edgeRadius = radius * Math.cos(angle);
    const rayAt = (travel: number) => new THREE.Ray(new THREE.Vector3(),
      new THREE.Vector3(travel * Math.cos(angle), travel * Math.sin(angle), -target.distance).normalize());
    expect(target.intersectRay(rayAt(edgeRadius * 0.99999))).not.toBeNull();
    // This point is inside an analytic circle but outside the rendered polygon.
    expect(target.intersectRay(rayAt((radius + edgeRadius) / 2))).toBeNull();
    expect(target.intersectRay(rayAt(radius * 1.001))).toBeNull();
  });

  it('finalizes and removes the target even when weapon cosmetics fail', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(arena.getDummyWeapon(), 'triggerFireAnimation').mockImplementation(() => { throw new Error('cosmetic failure'); });
    const callback = vi.fn();
    arena.setOnShotCallback(callback);
    arena.spawnTarget(0, 0);
    expect(() => arena.processShot(10)).not.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(arena.getActiveTargets()).toHaveLength(0);
    expect(warning).toHaveBeenCalledTimes(1);
  });
});
