import React, { useEffect, useRef, useCallback, useState } from 'react';
import { ArenaManager } from '../arena/ArenaManager';
import { RawInputEngine } from '../engine/RawInputEngine';
import { TestCoordinator } from '../arena/TestCoordinator';
import { ArenaHud } from './ArenaHud';
import { RestModal } from './RestModal';
import { DebugHud } from './DebugHud';
import { useAppStore } from '../store/useAppStore';
import { classifyTargetDirection } from '../engine/AimTelemetry';

export const ArenaView: React.FC = () => {
  const [debugActive, setDebugActive] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const coordinatorRef = useRef<TestCoordinator | null>(null);
  const arenaRef = useRef<ArenaManager | null>(null);
  const engineRef = useRef<RawInputEngine | null>(null);
  const initializedRef = useRef(false);

  const {
    isFatigued,
    setPointerLocked,
    setRawInputActive,
  } = useAppStore();

  // ONE-TIME initialization: create RawInputEngine, ArenaManager, TestCoordinator exactly ONCE.
  // This effect must NOT depend on phase — phase transitions are handled separately below.
  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;

    // Instantiate RawInputEngine and ArenaManager ONCE
    const engine = new RawInputEngine();
    const arena = new ArenaManager(containerRef.current, engine);
    if (!arena.isRendererAvailable()) {
      arena.dispose();
      engine.dispose();
      useAppStore.getState().failSession('WebGL rendering is unavailable. Enable browser hardware acceleration or use a browser with WebGL support, then retest.', 'error');
      return;
    }
    const coordinator = new TestCoordinator(arena, engine);

    engineRef.current = engine;
    arenaRef.current = arena;
    coordinatorRef.current = coordinator;
    initializedRef.current = true;
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('e2e')) {
      (window as unknown as { __valorantArena?: unknown }).__valorantArena = { arena, engine, coordinator };
    }

    arena.start();

    // Start the initial phase
    const currentPhase = useAppStore.getState().phase;
    if (currentPhase === 'warmup') {
      coordinator.startWarmup();
    } else if (currentPhase === 'coarse' || currentPhase === 'bracketing' || currentPhase === 'fine' || currentPhase === 'confirmation') {
      coordinator.startPhase(currentPhase);
    }

    const onPointerLockChange = () => {
      const isLocked = engine.isLocked();
      setPointerLocked(isLocked);
      setRawInputActive(engine.isRawInputActive());
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);

    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      delete (window as unknown as { __valorantArena?: unknown }).__valorantArena;
      coordinator.stop();
      arena.dispose();
      engine.dispose();
      setPointerLocked(false);
      setRawInputActive(false);
      initializedRef.current = false;
      engineRef.current = null;
      arenaRef.current = null;
      coordinatorRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPointerLocked, setRawInputActive]);

  const handleContainerClick = async () => {
    if (!containerRef.current || !engineRef.current) return;
    if (!engineRef.current.isLocked()) {
      const res = await engineRef.current.requestLock(containerRef.current);
      setLockError(res.success ? null : 'Mouse capture failed. Click the arena to retry; use Chrome or Edge if capture is unavailable.');
      setPointerLocked(res.success);
      setRawInputActive(res.unadjusted);
    }
  };

  const getDebugData = useCallback(() => {
    if (!arenaRef.current || !engineRef.current) {
      return null;
    }
    const stats = engineRef.current.getDebugStats();
    const cam = arenaRef.current.getCameraOrientation();
    const activeTargets = arenaRef.current.getActiveTargets();
    const currentTarget = activeTargets[0];
    const targetYaw = currentTarget ? (currentTarget.yaw * 180) / Math.PI : undefined;
    const targetPitch = currentTarget ? (currentTarget.pitch * 180) / Math.PI : undefined;
    const lastShot = arenaRef.current.getLastShotDebug();

    const crosshairEl = typeof document !== 'undefined' ? document.getElementById('shooting-crosshair') : null;
    const rect = crosshairEl?.getBoundingClientRect();

    return {
      isLocked: engineRef.current.isLocked(),
      dx: stats.lastDx,
      dy: stats.lastDy,
      pollingHz: stats.eventRateHz,
      camYaw: cam.yawDeg,
      camPitch: cam.pitchDeg,
      crosshairX: rect ? Math.round(rect.left + rect.width / 2) : Math.round(window.innerWidth / 2),
      crosshairY: rect ? Math.round(rect.top + rect.height / 2) : Math.round(window.innerHeight / 2),
      targetId: currentTarget?.id || 'NONE',
      targetYaw,
      targetPitch,
      targetDistance: currentTarget?.distance || 15,
      targetDir:
        targetYaw !== undefined && targetPitch !== undefined
          ? classifyTargetDirection(targetYaw - cam.yawDeg, targetPitch - cam.pitchDeg)
          : undefined,
      totalTravel: stats.counts.totalRawVectorTravel,
      provisionalSensitivity: coordinatorRef.current?.getSessionDebugState().provisionalSensitivity,
      sessionTrace: coordinatorRef.current?.getSessionDiagnostics(),
      lastShot,
    };
  }, []);

  const handleToggleDebug = useCallback((active: boolean) => {
    setDebugActive(active);
    if (arenaRef.current) {
      arenaRef.current.setDebugMode(active);
    }
  }, []);

  const handleToggleAlignmentCheck = useCallback((active: boolean) => {
    arenaRef.current?.setAlignmentCheck(active);
  }, []);

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className="fixed inset-0 z-50 w-full h-[100svh] bg-val-black overflow-hidden select-none cursor-crosshair"
    >
      <ArenaHud debugActive={debugActive} />
      {lockError && <div role="alert" className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#101923]/95 backdrop-blur border border-rose-400/40 rounded-2xl p-4 text-sm text-rose-200 shadow-xl w-[calc(100%-2rem)] max-w-lg leading-relaxed">{lockError}</div>}
      {isFatigued && <RestModal fatigueWarning durationSeconds={20} onComplete={() => coordinatorRef.current?.resumeAfterRest()} />}
      <DebugHud getDebugData={getDebugData} onToggleDebug={handleToggleDebug} onToggleAlignmentCheck={handleToggleAlignmentCheck} />
    </div>
  );
};
