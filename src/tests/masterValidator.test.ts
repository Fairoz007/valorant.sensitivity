import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ArenaManager } from '../arena/ArenaManager';
import { RawInputEngine } from '../engine/RawInputEngine';
import { CalibrationManager } from '../calibration/CalibrationManager';

afterEach(() => vi.unstubAllGlobals());

describe('MASTER-VALORANT-VALIDATOR projection and truthful diagnostics', () => {
  it('listens immediately when pointer-lock resolves before the change event', async () => {
    const doc = { pointerLockElement: null as HTMLElement | null, addEventListener: vi.fn(), removeEventListener: vi.fn(), exitPointerLock: vi.fn() };
    vi.stubGlobal('document', doc);
    const element = { requestPointerLock: async () => { doc.pointerLockElement = element as unknown as HTMLElement; } };
    const engine = new RawInputEngine();
    const result = await engine.requestLock(element as unknown as HTMLElement);
    expect(result.success).toBe(true);
    expect(doc.addEventListener.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(['mousemove', 'mousedown', 'mouseup']));
    engine.dispose();
  });
  it('mandatory flick ordering includes counts20+25+30 and excludes post-click50', () => {
    const engine = new RawInputEngine();
    const arena = new ArenaManager(null, engine);
    arena.setSensitivity(0.2);
    arena.spawnTarget(1.05, 0, 0.1);
    engine.startTrialCapture();
    for (const [timestamp, dx] of [[100, 20], [101, 25], [102, 30], [104, 50]]) {
      engine.handleMouseMove({ movementX: dx, movementY: 0, timeStamp: timestamp } as MouseEvent);
    }
    const shot = arena.processShot(103);
    expect(shot.cameraYawDeg).toBeCloseTo(1.05, 8);
    expect(shot.isHit).toBe(true);
    expect(engine.endTrialCapture(103).counts.totalRightCounts).toBe(75);
    expect(arena.getCameraOrientation().yawDeg).toBeCloseTo(1.75, 8);
    arena.dispose(); engine.dispose();
  });
  it('projects exact camera-forward target and shot onto center across FOV/aspect/DPR assumptions', () => {
    const engine = new RawInputEngine();
    const arena = new ArenaManager(null, engine);
    const camera = (arena as unknown as { camera: THREE.PerspectiveCamera }).camera;
    let checked = 0;
    for (const size of [[1920, 1080], [2560, 1440], [900, 720], [720, 1280]]) {
      for (const dpr of [1, 1.25, 2]) {
        for (const fov of [40, 75, 110]) {
          camera.aspect = size[0] / size[1];
          camera.fov = fov;
          camera.updateProjectionMatrix();
          for (const [yaw, pitch] of [[0, 0], [20, 10], [-20, 10], [20, -10], [-20, -10]]) {
            arena.clearTargets();
            arena.setCameraOrientation(yaw, pitch);
            const target = arena.spawnTarget(yaw, pitch, 1.25);
            const ndc = target.mesh.position.clone().project(camera);
            expect(ndc.x).toBeCloseTo(0, 8);
            expect(ndc.y).toBeCloseTo(0, 8);
            // CSS center corresponds to drawing-buffer center at every DPR.
            expect((ndc.x + 1) * size[0] * dpr / 2 / dpr).toBeCloseTo(size[0] / 2, 8);
            expect((1 - ndc.y) * size[1] * dpr / 2 / dpr).toBeCloseTo(size[1] / 2, 8);
            expect(arena.processShot().isHit).toBe(true);
            arena.spawnTarget(yaw + 3, pitch, 1.25);
            expect(arena.processShot().isHit).toBe(false);
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(180);
    arena.dispose(); engine.dispose();
  });
  it('does not invent raw support, mouse polling rate, display refresh, or desktop zoom', async () => {
    const manager = new CalibrationManager();
    const report = await manager.performSystemCheck(false);
    expect(report.rawInputSupported).toBe(false);
    expect(report.rawInputActive).toBe(false);
    expect(report.estimatedPollingRateHz).toBe(0);
    expect(report.estimatedRefreshRateHz).toBe(0);
    expect(report.browserZoom).toBe(0);
    expect(report.warnings.some(w => w.includes('cannot be measured reliably'))).toBe(true);
  });
});
