import { describe, expect, it, vi } from 'vitest';
import { RawInputEngine } from '../engine/RawInputEngine';
import { ArenaManager } from '../arena/ArenaManager';
import { TestCoordinator } from '../arena/TestCoordinator';
import { useAppStore } from '../store/useAppStore';
import { mulberry32 } from '../engine/TargetGenerator';
import { VALORANT_YAW_DEG_PER_COUNT } from '../config/constants';

const yawDelta = (target: number, start: number) => ((target-start+180)%360+360)%360-180;

describe('seeded validator center-ray stress', () => {
  it('hits 1200 randomized exact centers through raw input at varied camera orientations', () => {
    const rng = mulberry32(73463);
    const engine = new RawInputEngine();
    const arena = new ArenaManager(null, engine);
    let clock = 1000;
    try {
      for (let i=0; i<1200; i++) {
        arena.clearTargets(); arena.resetCamera();
        arena.setSensitivity(0.05+rng()*2.45);
        arena.setCameraOrientation(-170+rng()*340, -70+rng()*140);
        const target = arena.spawnTarget(-170+rng()*340, -75+rng()*150, 0.4+rng()*1.5);
        const start = arena.getCameraOrientation();
        const ty = target.yaw*180/Math.PI, tp = target.pitch*180/Math.PI;
        const scale = arena.getSensitivity()*VALORANT_YAW_DEG_PER_COUNT;
        const dx=yawDelta(ty,start.yawDeg)/scale, dy=-(tp-start.pitchDeg)/scale;
        for (let step=0; step<8; step++) {
          clock+=10;
          engine.handleMouseMove({movementX:dx/8,movementY:dy/8,timeStamp:clock} as MouseEvent);
        }
        clock+=10;
        const shot=arena.processShot(clock);
        expect(shot.isHit, JSON.stringify({i,ty,tp,start,cam:arena.getCameraOrientation(),error:shot.angularErrorDeg})).toBe(true);
      }
    } finally { arena.dispose(); engine.dispose(); }
  });

  it('completes six seeded full sessions through all scored phases without centered false misses', () => {
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
    let clock=1000;
    const now=vi.spyOn(performance,'now').mockImplementation(()=>clock);
    const random=vi.spyOn(Math,'random').mockImplementation(mulberry32(91363));
    try {
      for (let session=0; session<6; session++) {
        useAppStore.getState().resetSession();
        useAppStore.getState().setUserProfile({dpi:800,currentSens:0.15+session*0.08});
        useAppStore.getState().setPhase('warmup');
        const engine=new RawInputEngine(), arena=new ArenaManager(null,engine), coordinator=new TestCoordinator(arena,engine);
        try {
          const visited = new Set<string>();
          coordinator.startWarmup();
          for (let i=0;i<2500 && useAppStore.getState().phase!=='results';i++) {
            clock+=120; vi.advanceTimersByTime(120);
            const phase=useAppStore.getState().phase;
            visited.add(phase);
            if(phase==='results') break;
            if(phase==='rest') {coordinator.resumeAfterRest();continue;}
            const target=arena.getActiveTargets()[0]; expect(target).toBeDefined();
            const start=arena.getCameraOrientation();
            const ty=target.yaw*180/Math.PI, tp=target.pitch*180/Math.PI;
            const scale=arena.getSensitivity()*VALORANT_YAW_DEG_PER_COUNT;
            clock+=120;
            for(let j=0;j<8;j++) {
              clock+=20; engine.handleMouseMove({movementX:yawDelta(ty,start.yawDeg)/scale/8,movementY:-(tp-start.pitchDeg)/scale/8,timeStamp:clock} as MouseEvent);
            }
            clock+=40; const event=arena.processShot(clock);
            expect(event.isHit,JSON.stringify({session,i,phase,ty,tp,start,cam:arena.getCameraOrientation(),error:event.angularErrorDeg})).toBe(true);
          }
          expect(useAppStore.getState().phase).toBe('results');
          expect([...visited]).toEqual(expect.arrayContaining(['warmup','coarse','bracketing','fine','confirmation','results']));
          // Confirmation adds current sensitivity only when outside the winning neighborhood.
          expect(useAppStore.getState().allTrialResults.length).toBeGreaterThanOrEqual(182);
          expect(new Set(useAppStore.getState().allTrialResults.map(t => t.candidateId)).size).toBeGreaterThanOrEqual(14);
          expect(useAppStore.getState().finalRecommendation?.recommendedSens).toBeGreaterThan(0);
        } finally {coordinator.stop();arena.dispose();engine.dispose();}
      }
    } finally {now.mockRestore();random.mockRestore();vi.useRealTimers();}
  },30000);
});
