import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaManager } from '../arena/ArenaManager';
import { TestCoordinator } from '../arena/TestCoordinator';
import { RawInputEngine } from '../engine/RawInputEngine';
import { useAppStore } from '../store/useAppStore';
import { VALORANT_YAW_DEG_PER_COUNT } from '../config/constants';
import { SensitivityOptimizer } from '../sensitivity/SensitivityOptimizer';
import { analyzeTrial } from '../engine/AimTelemetry';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('Repaired measured session', () => {
  it('late pointer-lock notifications preserve unscored alignment mode', () => {
    const engine = new RawInputEngine();
    const arena = new ArenaManager(null, engine);
    const coordinator = new TestCoordinator(arena, engine);
    useAppStore.getState().resetSession();
    useAppStore.getState().setPhase('warmup');
    coordinator.startWarmup();
    arena.setAlignmentCheck(true);
    const lock = vi.spyOn(engine, 'isLocked').mockReturnValue(true);
    (coordinator as unknown as { onPointerLockChange(): void }).onPointerLockChange();
    expect(arena.getActiveTargets()[0].radiusDeg).toBe(5);
    expect(arena.processShot().isHit).toBe(true);
    expect(useAppStore.getState().allTrialResults).toHaveLength(0);
    lock.mockReturnValue(false);
    (coordinator as unknown as { onPointerLockChange(): void }).onPointerLockChange();
    lock.mockReturnValue(true);
    (coordinator as unknown as { onPointerLockChange(): void }).onPointerLockChange();
    expect(arena.getActiveTargets()[0].radiusDeg).toBe(5);
    expect(arena.processShot().isHit).toBe(true);
    coordinator.stop(); arena.dispose(); engine.dispose(); lock.mockRestore();
  });
  it('runs warmup and every actual candidate shot through the coordinator to an atomic result', () => {
    vi.useFakeTimers({ toFake: ['performance', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    const engine = new RawInputEngine();
    const arena = new ArenaManager(null, engine);
    const coordinator = new TestCoordinator(arena, engine);
    useAppStore.getState().resetSession();
    useAppStore.getState().setPhase('warmup');
    coordinator.startWarmup();
    const phases = new Set<string>();
    const applied = new Set<number>();
    let shots = 0;
    while (useAppStore.getState().phase !== 'results' && shots < 300) {
      const state = useAppStore.getState();
      phases.add(state.phase);
      if (state.phase === 'rest') { coordinator.resumeAfterRest(); continue; }
      vi.advanceTimersByTime(120);
      const internals = coordinator as unknown as {activeTarget: {yaw:number; pitch:number}};
      const target = internals.activeTarget;
      expect(target).toBeDefined();
      const orientation = arena.getCameraOrientation();
      applied.add(arena.getSensitivity());
      vi.advanceTimersByTime(150);
      engine.handleMouseMove({movementX:(target.yaw-orientation.yawDeg)/(arena.getSensitivity()*VALORANT_YAW_DEG_PER_COUNT),movementY:-(target.pitch-orientation.pitchDeg)/(arena.getSensitivity()*VALORANT_YAW_DEG_PER_COUNT)} as MouseEvent);
      vi.advanceTimersByTime(100);
      // Tracking target is snapshotted at current location by the arena.
      arena.processShot(performance.now());
      shots++;
    }
    const state = useAppStore.getState();
    expect([...phases]).toEqual(expect.arrayContaining(['warmup','coarse','bracketing','fine','confirmation']));
    expect(applied.size).toBeGreaterThan(5);
    expect(state.phase).toBe('results');
    const result = state.finalRecommendation!;
    expect(result).not.toBeNull();
    expect(Number.isFinite(result.recommendedSens)).toBe(true);
    expect(result.recommendedSens).toBeGreaterThan(0);
    expect(result.recommendedRange[0]).toBeLessThanOrEqual(result.recommendedSens);
    expect(result.recommendedRange[1]).toBeGreaterThanOrEqual(result.recommendedSens);
    expect(result.shotsAnalyzed).toBe(state.allTrialResults.reduce((sum,t) => sum+(t.shotsRequired??1),0));
    expect(state.allTrialResults.every(t => (t.rawSamplesCount??0)>0)).toBe(true);
    coordinator.stop(); arena.dispose(); engine.dispose();
    expect(useAppStore.getState().finalRecommendation).toBe(result);
  });
  it('preserves miss then correction then hit in measured trials', () => {
    vi.useFakeTimers({ toFake: ['performance', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    const engine = new RawInputEngine();
    const arena = new ArenaManager(null, engine);
    const coordinator = new TestCoordinator(arena, engine);
    useAppStore.getState().resetSession();
    useAppStore.getState().setPhase('coarse');
    coordinator.startPhase('coarse');
    const target = (coordinator as unknown as {activeTarget:{yaw:number;pitch:number}}).activeTarget;
    vi.advanceTimersByTime(150);
    arena.processShot(performance.now());
    expect(useAppStore.getState().allTrialResults).toHaveLength(0);
    engine.handleMouseMove({movementX:target.yaw/(arena.getSensitivity()*VALORANT_YAW_DEG_PER_COUNT),movementY:-target.pitch/(arena.getSensitivity()*VALORANT_YAW_DEG_PER_COUNT)} as MouseEvent);
    vi.advanceTimersByTime(100);
    arena.processShot(performance.now());
    const trial = useAppStore.getState().allTrialResults[0];
    expect(trial.firstShotHit).toBe(false);
    expect(trial.eventualHit).toBe(true);
    expect(trial.shotsRequired).toBe(2);
    expect(trial.firstShotTotalErrorDeg).toBeGreaterThan(0);
    expect(trial.totalEndpointErrorDeg).toBeCloseTo(0);
    coordinator.stop(); arena.dispose(); engine.dispose();
  });
  it('keeps boundary candidates physically distinct', () => {
    for (const sensitivity of [.05, 2.5]) {
      const candidates=SensitivityOptimizer.generatePhase1Candidates(sensitivity);
      expect(candidates).toHaveLength(5);
      expect(new Set(candidates.map(c=>c.sens)).size).toBe(5);
    }
  });
  it('reports no-trial and optimizer failures explicitly', () => {
    const engine=new RawInputEngine(); const arena=new ArenaManager(null,engine);
    const coordinator=new TestCoordinator(arena,engine);
    useAppStore.getState().resetSession(); useAppStore.getState().setPhase('coarse'); coordinator.startPhase('coarse');
    (coordinator as unknown as {transitionNextSearchPhase:()=>void}).transitionNextSearchPhase();
    expect(useAppStore.getState().resultError).toContain('NO_TRIALS');
    expect(useAppStore.getState().finalRecommendation).toBeNull();
    useAppStore.getState().resetSession(); useAppStore.getState().setPhase('coarse'); coordinator.startPhase('coarse');
    vi.spyOn(SensitivityOptimizer,'evaluateCandidate').mockImplementation(()=>{throw new Error('controlled optimizer failure');});
    (coordinator as unknown as {completeCandidateBlock:()=>void}).completeCandidateBlock();
    expect(useAppStore.getState().resultError).toContain('OPTIMIZER_ERROR');
    expect(useAppStore.getState().resultStatus).toBe('error');
    expect(coordinator.getSessionDiagnostics().length).toBeLessThanOrEqual(100);
    coordinator.stop(); arena.dispose(); engine.dispose();
  });
  it('cannot rank zero-data candidates as measured winners', () => {
    expect(SensitivityOptimizer.rankCandidates(SensitivityOptimizer.generatePhase1Candidates(.3))).toEqual([]);
  });
  it('ignores motion after the shot and handles yaw wrapping without a giant overshoot', () => {
    const points = [
      {timestamp:0,yaw:179,pitch:0,dx:0,dy:0,v:0},
      {timestamp:150,yaw:181,pitch:0,dx:10,dy:0,v:20},
      {timestamp:250,yaw:181,pitch:0,dx:0,dy:0,v:0},
      {timestamp:300,yaw:220,pitch:0,dx:100,dy:0,v:100},
    ];
    const result=analyzeTrial(points,-179,0,.8,0,250,false,false);
    expect(result.endpointError).toBeCloseTo(0);
    expect(result.actualDistance).toBeCloseTo(2);
    expect(result.isOvershoot).toBe(false);
    expect(result.downsampledTrajectory.every(p=>p.timestamp<=250)).toBe(true);
  });
});
