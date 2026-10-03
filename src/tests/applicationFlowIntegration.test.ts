import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useAppStore } from '../store/useAppStore';
import { ResultsContent } from '../components/ResultsView';
import { RawInputEngine } from '../engine/RawInputEngine';
import { ArenaManager } from '../arena/ArenaManager';
import { TestCoordinator } from '../arena/TestCoordinator';
import { VALORANT_YAW_DEG_PER_COUNT } from '../config/constants';

describe('Application session completion and result rendering', () => {
  beforeEach(() => useAppStore.getState().resetSession());
  const renderResults = () => {
    const { finalRecommendation, resetSession, resultStatus, resultError } = useAppStore.getState();
    return renderToStaticMarkup(createElement(ResultsContent, { finalRecommendation, resetSession, resultStatus, resultError }));
  };

  it('runs real target shots through every phase and renders the same persistent recommendation', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let clock = 1000;
    const clockSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const engine = new RawInputEngine();
    const arena = new ArenaManager(null, engine);
    const coordinator = new TestCoordinator(arena, engine);
    const phases = new Set<string>();
    useAppStore.getState().setUserProfile({ dpi: 800, currentSens: 0.3 });
    useAppStore.getState().setPhase('system-check');
    useAppStore.getState().setPhase('calibration');
    useAppStore.getState().setPhase('warmup');
    coordinator.startWarmup();
    try {
      for (let shot = 0; shot < 2000 && useAppStore.getState().phase !== 'results'; shot++) {
        clock += 120;
        vi.advanceTimersByTime(120);
        if (useAppStore.getState().phase === 'results') break;
        const state = useAppStore.getState();
        phases.add(state.phase);
        if (state.phase === 'rest') { coordinator.resumeAfterRest(); continue; }
        const target = arena.getActiveTargets()[0];
        expect(target).toBeDefined();
        const start = arena.getCameraOrientation();
        const yaw = target.yaw * 180 / Math.PI;
        const pitch = target.pitch * 180 / Math.PI;
        const yawDelta = ((yaw - start.yawDeg + 180) % 360 + 360) % 360 - 180;
        const scale = arena.getSensitivity() * VALORANT_YAW_DEG_PER_COUNT;
        clock += 120;
        for (let i = 0; i < 8; i++) {
          clock += 20;
          engine.handleMouseMove({ movementX: yawDelta / scale / 8, movementY: -(pitch - start.pitchDeg) / scale / 8, timeStamp: clock } as MouseEvent);
        }
        clock += 40;
        const event = arena.processShot(clock); expect(event.isHit, JSON.stringify({ shot, phase: state.phase, yaw, pitch, start, camera: arena.getCameraOrientation(), event: { ...event, target: undefined } })).toBe(true);
      }
      expect([...phases]).toEqual(expect.arrayContaining(['warmup', 'coarse', 'bracketing', 'fine', 'confirmation']));
      const result = useAppStore.getState().finalRecommendation;
      expect(useAppStore.getState().phase).toBe('results');
      expect(result).not.toBeNull();
      expect(Number.isFinite(result!.recommendedSens)).toBe(true);
      expect(result!.recommendedSens).toBeGreaterThan(0);
      expect(result!.recommendedRange[0]).toBeLessThanOrEqual(result!.recommendedSens);
      expect(result!.recommendedRange[1]).toBeGreaterThanOrEqual(result!.recommendedSens);
      const count = useAppStore.getState().allTrialResults.length;
      coordinator.stop();
      arena.dispose();
      engine.dispose();
      expect(useAppStore.getState().finalRecommendation).toBe(result);
      expect(useAppStore.getState().allTrialResults).toHaveLength(count);
      const html = renderResults();
      expect(html).toContain(result!.recommendedSens.toFixed(3));
      expect(html).toContain('Shots analyzed');
      useAppStore.getState().completeSession({ ...result!, recommendedSens: Number.NaN });
      expect(useAppStore.getState().resultStatus).toBe('error');
      expect(renderResults()).toContain('invalid values');
      expect(renderResults()).not.toContain('NaN');
      useAppStore.getState().completeSession({ ...result!, radar: { ...result!.radar, control: Infinity } });
      expect(useAppStore.getState().resultStatus).toBe('error');
      expect(renderResults()).not.toContain('Infinity');
      useAppStore.getState().resetSession();
      expect(useAppStore.getState().finalRecommendation).toBeNull();
      expect(useAppStore.getState().allTrialResults).toHaveLength(0);
      expect(useAppStore.getState().targetsRemaining).toBe(0);
      expect(useAppStore.getState().phase).toBe('setup');
    } finally {
      coordinator.stop(); arena.dispose(); engine.dispose(); clockSpy.mockRestore(); vi.useRealTimers();
    }
  });

  it('shows explicit insufficient-data, computation-error and loading states', () => {
    useAppStore.getState().failSession('No valid mouse trajectories were recorded.');
    expect(renderResults()).toContain('No valid mouse trajectories were recorded.');
    useAppStore.getState().failSession('Non-finite metrics', 'error');
    expect(renderResults()).toContain('Computation Error');
    useAppStore.getState().beginResultCalculation();
    expect(renderResults()).toContain('Calculating');
  });
});


