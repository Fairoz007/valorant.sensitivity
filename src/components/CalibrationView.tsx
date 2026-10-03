import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { calibrationManager } from '../calibration/CalibrationManager';
import { RawInputEngine } from '../engine/RawInputEngine';
import type { CalibrationStep, CalibrationMotionStats } from '../calibration/CalibrationManager';
import type { InputDebugStats } from '../engine/RawInputEngine';
import {
  MousePointer,
  ArrowLeftRight,
  ArrowUpDown,
  Target,
  CheckCircle2,
  RotateCcw,
  Cpu,
  ArrowRight,
} from 'lucide-react';

export const CalibrationView: React.FC = () => {
  const { setPhase, setRawInputActive, setPointerLocked } = useAppStore();
  
  const [step, setStep] = useState<CalibrationStep>('horizontal-motion');
  const [motionStats, setMotionStats] = useState<CalibrationMotionStats>(calibrationManager.getMotionStats());
  const [clicks, setClicks] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [debugStats, setDebugStats] = useState<InputDebugStats>({
    isLocked: false,
    rawInputActive: false,
    totalEvents: 0,
    lastDx: 0,
    lastDy: 0,
    accumulatedX: 0,
    accumulatedY: 0,
    eventRateHz: 0,
    lastEventTimestamp: 0,
    counts: {
      totalRightCounts: 0,
      totalLeftCounts: 0,
      netHorizontalCounts: 0,
      absoluteHorizontalTravel: 0,
      totalUpCounts: 0,
      totalDownCounts: 0,
      netVerticalCounts: 0,
      absoluteVerticalTravel: 0,
      totalRawVectorTravel: 0,
    },
  });

  const arenaRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RawInputEngine | null>(null);

  const syncState = useCallback(() => {
    const currentStep = calibrationManager.getStep();
    const stats = calibrationManager.getMotionStats();
    const clicksDone = calibrationManager.getClicksCompleted();
    
    useAppStore.getState().setCalibrationStep(currentStep);
    useAppStore.getState().setCalibrationStats(stats);
    useAppStore.getState().setCalibrationClicks(clicksDone);
    setStep(currentStep);
    setMotionStats(stats);
    setClicks(clicksDone);

    if (engineRef.current) {
      setDebugStats(engineRef.current.getDebugStats());
    }
  }, []);

  const handlePointerLock = async () => {
    if (!arenaRef.current || !engineRef.current) return;
    try {
      const res = await engineRef.current.requestLock(arenaRef.current);
      const locked = res.success || engineRef.current.isLocked();
      setIsLocked(locked);
      setPointerLocked(locked);
      setRawInputActive(res.unadjusted);
      syncState();
    } catch (e) {
      console.error('Pointer lock rejected in calibration', e);
    }
  };

  useEffect(() => {
    const engine = new RawInputEngine();
    engineRef.current = engine;
    calibrationManager.reset();
    calibrationManager.setStep('horizontal-motion');

    let rafId: number | null = null;
    const scheduleSync = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          syncState();
          rafId = null;
        });
      }
    };
    scheduleSync();

    // Direct subscription to high-frequency deltas with rAF-throttled UI sync
    const unsubDelta = engine.subscribeDelta((dx, dy) => {
      calibrationManager.processCalibrationDelta(dx, dy);
      scheduleSync();
    });

    // Direct subscription to primary clicks (immediate sync)
    const unsubClick = engine.subscribeClick((button) => {
      const isFinished = calibrationManager.registerCalibrationClick(button);
      syncState();
      if (isFinished) {
        engine.unlock();
      }
    });

    const onPointerLockChange = () => {
      const locked = engine.isLocked();
      setIsLocked(locked);
      setPointerLocked(locked);
      setRawInputActive(engine.isRawInputActive());
      syncState();
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      unsubDelta();
      unsubClick();
      engine.dispose();
      setPointerLocked(false);
      setRawInputActive(false);
      engineRef.current = null;
    };
  }, [setPointerLocked, setRawInputActive, syncState]);

  const handleProceedToWarmup = () => {
    engineRef.current?.unlock();
    setPointerLocked(false);
    setRawInputActive(false);
    setPhase('warmup');
  };

  const handleRerun = () => {
    calibrationManager.reset();
    calibrationManager.setStep('horizontal-motion');
    syncState();
  };

  return (
    <div className="lab-page max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12 space-y-6">
      <header className="mb-8">
        <div className="lab-eyebrow mb-4">PRECISION LAB / SENSOR CALIBRATION</div>
        <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-4">
          Precision starts at the sensor.
        </h2>
        <p className="text-val-muted text-sm max-w-2xl leading-relaxed">
          Calibrate raw sensor deltas, directional swipe detection, and primary button debounce without affecting scoring.
        </p>
      </header>

      {/* Calibration Stepper Tabs */}
      <div className="lab-panel p-4 flex flex-wrap items-center justify-start gap-3 font-mono text-xs">
        <div
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border transition-all ${
            step === 'horizontal-motion'
              ? 'border-val-cyan bg-val-cyan/15 text-val-cyan shadow-sm shadow-val-cyan/20'
              : step !== 'idle'
              ? 'border-val-border text-val-muted'
              : 'border-val-border text-gray-500'
          }`}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" /> 1. Horizontal Motion
        </div>
        <div
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border transition-all ${
            step === 'vertical-motion'
              ? 'border-val-cyan bg-val-cyan/15 text-val-cyan shadow-sm shadow-val-cyan/20'
              : step === 'click-calibration' || step === 'complete'
              ? 'border-val-border text-val-muted'
              : 'border-val-border text-gray-500'
          }`}
        >
          <ArrowUpDown className="w-3.5 h-3.5" /> 2. Vertical Motion
        </div>
        <div
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border transition-all ${
            step === 'click-calibration'
              ? 'border-val-cyan bg-val-cyan/15 text-val-cyan shadow-sm shadow-val-cyan/20'
              : step === 'complete'
              ? 'border-val-border text-val-muted'
              : 'border-val-border text-gray-500'
          }`}
        >
          <Target className="w-3.5 h-3.5" /> 3. Click Test
        </div>
      </div>

      {/* Main Interactive Calibration Arena */}
      <div
        ref={arenaRef}
        onClick={handlePointerLock}
        className={`relative min-h-80 h-auto py-8 sm:min-h-96 w-full rounded-2xl border transition-all flex flex-col items-center justify-center cursor-crosshair select-none overflow-hidden ${
          isLocked
            ? 'border-val-cyan bg-val-dark shadow-2xl shadow-val-cyan/15'
            : 'border-val-border hover:border-val-cyan/60 bg-val-dark/90'
        }`}
      >
        {!isLocked && step !== 'complete' && (
          <div className="text-center p-6 space-y-4">
            <div className="w-14 h-14 rounded-full bg-val-cyan/10 border border-val-cyan/30 flex items-center justify-center mx-auto text-val-cyan pointer-events-none">
              <MousePointer className="w-6 h-6 animate-pulse" />
            </div>
            <div className="pointer-events-none">
              <h3 className="text-lg font-bold text-white uppercase font-mono tracking-wide">
                Click Inside to Lock Mouse & Calibrate
              </h3>
              <p className="text-xs text-val-muted max-w-sm mx-auto mt-1">
                Requests hardware Pointer Lock. Move the mouse to test raw coordinate deltas. Press <kbd className="px-1.5 py-0.5 bg-val-dark border border-val-border rounded text-val-cyan font-mono">ESC</kbd> anytime to unlock.
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePointerLock();
              }}
              className="px-6 py-2.5 bg-val-cyan hover:bg-val-cyan/80 text-black font-mono font-bold text-xs uppercase tracking-wider rounded-lg shadow-lg shadow-val-cyan/20 transition-all flex items-center gap-2 mx-auto cursor-pointer"
            >
              <MousePointer className="w-4 h-4" /> Click to Lock Pointer & Calibrate
            </button>
          </div>
        )}

        {/* Phase 1: Horizontal Motion */}
        {isLocked && step === 'horizontal-motion' && (
          <div className="text-center space-y-4 max-w-md px-4">
            <div className="w-16 h-16 rounded-full bg-val-cyan/20 border-2 border-val-cyan flex items-center justify-center mx-auto text-val-cyan animate-pulse">
              <ArrowLeftRight className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold font-mono text-white">Move Mouse: LEFT ⟷ RIGHT</h3>
              <p className="text-xs text-val-muted mt-1">
                Swipe smoothly back and forth across your normal aiming area.
              </p>
              <div className="text-xs font-mono text-val-cyan bg-val-cyan/10 px-3 py-1 rounded-full inline-block border border-val-cyan/30 mt-2">
                {motionStats.currentHorizontalDir === 'NONE'
                  ? 'Swipe LEFT or RIGHT'
                  : motionStats.currentHorizontalDir === 'RIGHT'
                  ? '← Now swipe LEFT'
                  : '→ Now swipe RIGHT'}
              </div>
            </div>
            
            <div className="w-full max-w-72 bg-val-dark border border-val-border rounded-full h-3.5 mx-auto overflow-hidden">
              <div
                className="bg-val-cyan h-full transition-all duration-150"
                style={{ width: `${Math.min(100, (motionStats.horizontalSwipes / 4) * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-gray-300 w-full max-w-72 mx-auto">
              <span>Direction: <strong className="text-val-cyan">{motionStats.currentHorizontalDir}</strong></span>
              <span>Swipes completed: <strong className="text-val-cyan">{motionStats.horizontalSwipes} / 4</strong></span>
            </div>
          </div>
        )}

        {/* Phase 2: Vertical Motion */}
        {isLocked && step === 'vertical-motion' && (
          <div className="text-center space-y-4 max-w-md px-4">
            <div className="w-16 h-16 rounded-full bg-val-cyan/20 border-2 border-val-cyan flex items-center justify-center mx-auto text-val-cyan animate-pulse">
              <ArrowUpDown className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold font-mono text-white">Move Mouse: UP ⟷ DOWN</h3>
              <p className="text-xs text-val-muted mt-1">
                Move smoothly up and down to calibrate vertical axis deltas.
              </p>
              <div className="text-xs font-mono text-val-cyan bg-val-cyan/10 px-3 py-1 rounded-full inline-block border border-val-cyan/30 mt-2">
                {motionStats.currentVerticalDir === 'NONE'
                  ? 'Swipe UP or DOWN'
                  : motionStats.currentVerticalDir === 'DOWN'
                  ? '↑ Now swipe UP'
                  : '↓ Now swipe DOWN'}
              </div>
            </div>
            <div className="w-full max-w-72 bg-val-dark border border-val-border rounded-full h-3.5 mx-auto overflow-hidden">
              <div
                className="bg-val-cyan h-full transition-all duration-150"
                style={{ width: `${Math.min(100, (motionStats.verticalSwipes / 4) * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-gray-300 w-full max-w-72 mx-auto">
              <span>Direction: <strong className="text-val-cyan">{motionStats.currentVerticalDir}</strong></span>
              <span>Swipes completed: <strong className="text-val-cyan">{motionStats.verticalSwipes} / 4</strong></span>
            </div>
          </div>
        )}

        {/* Phase 3: Click Calibration */}
        {isLocked && step === 'click-calibration' && (
          <div className="text-center space-y-4 max-w-md px-4">
            <div className="w-16 h-16 rounded-full bg-val-red/20 border-2 border-val-red flex items-center justify-center mx-auto text-val-red animate-pulse">
              <Target className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold font-mono text-white">Left-Click 3 Times</h3>
              <p className="text-xs text-val-muted mt-1">
                Click naturally to verify primary button register and debounce filtering.
              </p>
            </div>
            <div className="flex justify-center gap-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-mono text-xs transition-all ${
                    clicks > i
                      ? 'bg-val-cyan border-val-cyan text-black font-bold'
                      : 'border-val-border bg-val-dark text-val-muted'
                  }`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Calibration Completed */}
        {step === 'complete' && (
          <div className="text-center space-y-4 p-6">
            <div className="w-16 h-16 rounded-full bg-val-cyan/20 border-2 border-val-cyan flex items-center justify-center mx-auto text-val-cyan">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold font-mono text-white">Calibration Successful!</h3>
            <p className="text-sm text-val-muted max-w-md mx-auto">
              All horizontal/vertical motion deltas and button clicks registered cleanly.
              Hardware input rate observed: <span className="text-val-cyan font-mono font-bold">{debugStats.eventRateHz > 0 ? `${debugStats.eventRateHz} Hz` : 'Not measured'}</span>.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <button
                type="button"
                onClick={handleRerun}
                className="px-4 py-2 rounded-lg border border-val-border text-val-muted hover:text-white font-mono text-xs flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Re-run Calibration
              </button>

              <button
                type="button"
                onClick={handleProceedToWarmup}
                className="px-6 py-2.5 bg-val-cyan hover:bg-val-cyan/80 text-val-dark font-bold rounded-lg uppercase tracking-wider font-mono text-sm shadow-lg shadow-val-cyan/20"
              >
                Proceed to Warm-Up Arena
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Navigation and Direct Arena Bypass */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setPhase('system-check')}
          className="w-full sm:w-auto px-4 py-2 rounded-lg border border-val-border text-val-muted hover:text-white font-mono text-xs flex items-center justify-center gap-1.5 hover:bg-val-dark transition-all cursor-pointer"
        >
          ← Back to Diagnostics
        </button>

        <button
          type="button"
          onClick={handleProceedToWarmup}
          className="w-full sm:w-auto px-5 py-2.5 bg-val-card hover:bg-val-dark border border-val-cyan/40 hover:border-val-cyan text-val-cyan hover:text-white font-mono text-xs font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-val-cyan/10 transition-all cursor-pointer"
        >
          <span>Skip Calibration & Enter Shooting Arena</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Task 1 & 2 Live Development Telemetry Instrumentation */}
      <div className="lab-panel p-5 sm:p-6 font-mono text-xs text-gray-300 space-y-4">
        <div className="flex flex-wrap gap-3 items-center justify-between border-b border-val-border/60 pb-2">
          <div className="flex items-center gap-2 text-val-cyan font-bold uppercase tracking-wider text-[11px]">
            <Cpu className="w-4 h-4" /> Live Hardware Input Telemetry
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                isLocked
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-val-red/20 text-val-red border border-val-red/40'
              }`}
            >
              Pointer Lock: {isLocked ? 'ACTIVE' : 'INACTIVE'}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                debugStats.rawInputActive
                  ? 'bg-val-cyan/20 text-val-cyan border border-val-cyan/40'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              }`}
            >
              {debugStats.rawInputActive ? 'RAW INPUT' : 'STANDARD'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          <div className="min-w-0 bg-val-dark/60 p-3 rounded-lg border border-val-border/50 break-words">
            <div className="text-[10px] text-val-muted">mousemove events</div>
            <div className="text-sm font-bold text-white mt-0.5">{debugStats.totalEvents.toLocaleString()}</div>
          </div>

          <div className="min-w-0 bg-val-dark/60 p-3 rounded-lg border border-val-border/50 break-words">
            <div className="text-[10px] text-val-muted">movementX / Y</div>
            <div className="text-sm font-bold text-white mt-0.5">
              {debugStats.lastDx} / {debugStats.lastDy}
            </div>
          </div>

          <div className="min-w-0 bg-val-dark/60 p-3 rounded-lg border border-val-border/50 break-words">
            <div className="text-[10px] text-val-muted">accumulatedX / Y</div>
            <div className="text-sm font-bold text-white mt-0.5">
              {debugStats.accumulatedX} / {debugStats.accumulatedY}
            </div>
          </div>

          <div className="min-w-0 bg-val-dark/60 p-3 rounded-lg border border-val-border/50 break-words">
            <div className="text-[10px] text-val-muted">event rate</div>
            <div className="text-sm font-bold text-val-cyan mt-0.5">{debugStats.eventRateHz} Hz</div>
          </div>

          <div className="min-w-0 bg-val-dark/60 p-3 rounded-lg border border-val-border/50 break-words">
            <div className="text-[10px] text-val-muted">swipes / threshold</div>
            <div className="text-sm font-bold text-white mt-0.5">
              {step === 'horizontal-motion' ? motionStats.horizontalSwipes : motionStats.verticalSwipes} / 4
            </div>
          </div>

          <div className="min-w-0 bg-val-dark/60 p-3 rounded-lg border border-val-border/50 break-words">
            <div className="text-[10px] text-val-muted">last event</div>
            <div className="text-[11px] font-bold text-gray-300 mt-1">
              {Math.round(debugStats.lastEventTimestamp)} ms
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
