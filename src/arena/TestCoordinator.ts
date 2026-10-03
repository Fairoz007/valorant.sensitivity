import { ArenaManager, type ShotEventData } from './ArenaManager';
import { RawInputEngine } from '../engine/RawInputEngine';
import { generateBalancedCandidateBattery, type TargetDef } from '../engine/TargetGenerator';
import { analyzeTrial, type TelemetryPoint, classifyTargetDirection } from '../engine/AimTelemetry';
import { SensitivityOptimizer, isUsableTrial, median } from '../sensitivity/SensitivityOptimizer';
import { computeConfidence } from '../sensitivity/ConfidenceModel';
import { generateExplanation } from '../sensitivity/ExplanationGenerator';
import { useAppStore } from '../store/useAppStore';
import type { CandidateSensitivity, TrialResult, FinalRecommendation } from '../types';
import { MIN_TRIALS_PER_CANDIDATE } from '../config/constants';
import { calculateEDPI, calculateCmPer360, angularDistance, signedYawDelta } from '../engine/MathEngine';

/**
 * AGENT 4: SHOOTING ANALYTICS ENGINEER
 * TestCoordinator manages the scientific shooting battery, target sequencing,
 * per-shot trial result generation, first-shot vs eventual hit tracking,
 * and directional performance aggregation.
 */
export class TestCoordinator {
  private lastTrialTrace: Record<string, unknown> | null = null;
  public getLastTrialTrace() { return this.lastTrialTrace; }
  private diagnostics: { timestamp: number; boundary: string; phase: string; details: Record<string, unknown> }[] = [];
  public getSessionDebugState() {
    const state = useAppStore.getState();
    return { provisionalSensitivity: this.provisionalSens, phase: state.phase,
      trialsCollected: state.allTrialResults.length,
      confirmationComplete: state.phase === 'results' && state.resultStatus === 'valid' };
  }
  public getSessionDiagnostics() { return this.diagnostics.map(entry => ({ ...entry, details: { ...entry.details } })); }
  private trace(boundary: string, details: Record<string, unknown> = {}) {
    if (!import.meta.env.DEV) return;
    this.diagnostics.push({ timestamp: performance.now(), boundary, phase: useAppStore.getState().phase, details });
    if (this.diagnostics.length > 100) this.diagnostics.shift();
  }
  private fail(code: 'NO_TRIALS' | 'ONE_CANDIDATE_ONLY' | 'INVALID_METRICS' | 'CONFIRMATION_INCOMPLETE' | 'OPTIMIZER_ERROR', reason: string) {
    this.isRunning = false;
    this.cancelPendingSpawn();
    this.activeTarget = null;
    this.inputEngine.endTrialCapture();
    this.arena.clearTargets();
    this.trace('error', { code, reason });
    useAppStore.getState().failSession(`${code}: ${reason}`, code === 'INVALID_METRICS' || code === 'OPTIMIZER_ERROR' ? 'error' : 'insufficient-data');
  }
  private arena: ArenaManager;
  private inputEngine: RawInputEngine;
  
  // Phase & Progression
  private currentCandidates: CandidateSensitivity[] = [];
  private activeCandidateIdx = 0;
  private currentTargets: TargetDef[] = [];
  private currentTargetIdx = 0;
  private activeTarget: TargetDef | null = null;
  private nextTargetTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly spawnIntervalMs = 120;
  private cancelPendingSpawn() {
    if (this.nextTargetTimeout !== null) clearTimeout(this.nextTargetTimeout);
    this.nextTargetTimeout = null;
  }
  private scheduleNextTarget() {
    this.cancelPendingSpawn();
    this.nextTargetTimeout = setTimeout(() => {
      this.nextTargetTimeout = null;
      if (this.isRunning && !this.suspended) this.spawnNextTarget();
    }, this.spawnIntervalMs);
  }
  private seed = 1337;

  // Active Trial State (Task 8)
  private currentTrialPoints: TelemetryPoint[] = [];
  private targetSpawnTime = 0;
  private startingCameraOrientation = { yawDeg: 0, pitchDeg: 0 };
  private pointerLockLostDuringTrial = false;
  private focusLostDuringTrial = false;
  private missesOnActiveTarget = 0;
  private firstShotHit = false;
  private firstShotHorizontalErrorDeg = 0;
  private firstShotVerticalErrorDeg = 0;
  private firstShotTotalErrorDeg = 0;

  private isRunning = false;
  private unsubscribeSample: (() => void) | null = null;
  private phaseBeforeRest: 'coarse' | 'bracketing' | 'fine' | 'confirmation' | null = null;
  private provisionalSens: number | null = null;
  private phaseSeed = 42000;
  private suspended = false;
  private onPointerLockChange = () => {
    if (!this.isRunning) return;
    if (!this.inputEngine.isLocked()) this.pauseTrial();
    else if (this.arena.isAlignmentCheck()) {
      // A delayed lock event must not replace the diagnostic disk with a
      // measured target. Diagnostic suspension is distinct from focus loss.
      this.suspended = true;
      this.arena.setPaused(false);
      if (this.arena.getActiveTargets().length === 0) {
        this.arena.resetCamera();
        this.arena.spawnTarget(0, 0, 5, 0, 0, 'alignment-check');
      }
    }
    else if (this.suspended) {
      this.suspended = false;
      this.arena.setPaused(false);
      this.startRoundTimer();
      this.spawnNextTarget();
    }
  };
  private onBlur = () => { if (this.isRunning) this.pauseTrial(); };
  private onVisibilityChange = () => { if (typeof document !== 'undefined' && document.hidden && this.isRunning) this.pauseTrial(); };
  private pauseTrial() {
    this.cancelPendingSpawn();
    this.activeTarget = null;
    this.suspended = true;
    if (this.timerIntervalId) { clearInterval(this.timerIntervalId); this.timerIntervalId = null; }
    this.arena.setPaused(true);
    this.inputEngine.endTrialCapture();
    this.arena.clearTargets();
  }
  private sampleIntervalId: number | null = null;
  private roundStartTime = 0;
  private timerIntervalId: number | null = null;

  constructor(arena: ArenaManager, inputEngine: RawInputEngine) {
    this.arena = arena;
    this.inputEngine = inputEngine;

    this.arena.setOnDiagnosticModeCallback(enabled => {
      if (!this.isRunning) return;
      this.cancelPendingSpawn();
      this.activeTarget = null;
      this.suspended = enabled;
      this.inputEngine.endTrialCapture();
      if (enabled) {
        this.arena.setPaused(false);
        if (this.timerIntervalId) { clearInterval(this.timerIntervalId); this.timerIntervalId = null; }
      } else if (typeof document === 'undefined' || this.inputEngine.isLocked()) {
        this.arena.setPaused(false);
        this.startRoundTimer();
        this.spawnNextTarget();
      } else this.pauseTrial();
    });
    this.arena.setOnFrameStallCallback(() => {
      if (!this.isRunning || this.suspended) return;
      this.inputEngine.endTrialCapture();
      this.arena.clearTargets();
      this.spawnNextTarget();
    });
    this.arena.setOnShotCallback((shotEvent: ShotEventData) => {
      this.handleShot(shotEvent);
    });

    this.unsubscribeSample = this.inputEngine.subscribeSample(sample => {
      if (!this.isRunning || this.suspended || !this.activeTarget || sample.timestamp < this.targetSpawnTime) return;
      this.currentTrialPoints.push({ timestamp: sample.timestamp, dx: sample.dx, dy: sample.dy,
        yaw: sample.cameraYaw, pitch: sample.cameraPitch,
        v: Math.hypot(sample.angularVelocityX, sample.angularVelocityY) });
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerlockchange', this.onPointerLockChange);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') window.addEventListener('blur', this.onBlur);
  }

  public startWarmup() {
    this.isRunning = true;
    this.suspended = typeof document !== 'undefined' && !this.inputEngine.isLocked();
    this.arena.setPaused(this.suspended);
    this.arena.setSensitivity(useAppStore.getState().userProfile.currentSens);
    this.arena.resetCamera();
    this.arena.clearTargets();

    // Balanced warmup battery
    this.currentTargets = generateBalancedCandidateBattery(this.seed++);
    this.currentTargetIdx = 0;

    const store = useAppStore.getState();
    store.updateHud(this.currentTargets.length, 0, 0, 0);
    this.startRoundTimer();

    this.spawnNextTarget();
    this.startSamplingLoop();
  }

  public startPhase(phase: 'coarse' | 'bracketing' | 'fine' | 'confirmation') {
    this.isRunning = true;
    const store = useAppStore.getState();
    const s0 = store.userProfile.currentSens;

    if (phase === 'coarse') {
      this.currentCandidates = SensitivityOptimizer.generatePhase1Candidates(s0);
      this.activeCandidateIdx = 0;
      store.setCandidateProgress(1, this.currentCandidates.length);
    }

    this.startCandidateBlock();
  }

  private startCandidateBlock() {
    const candidate = this.currentCandidates[this.activeCandidateIdx];
    if (!candidate) return;

    const store = useAppStore.getState();
    store.setActiveCandidate(candidate);
    store.setCandidateProgress(this.activeCandidateIdx + 1, this.currentCandidates.length);

    this.arena.setSensitivity(candidate.sens);
    this.trace('candidateApplied', {candidateId: candidate.id, candidateSensitivity: candidate.sens, actualSensitivity: this.arena.getSensitivity(), candidateCount: this.currentCandidates.length});
    this.arena.resetCamera();
    this.arena.clearTargets();

    // Generate statistically equivalent test battery (Task 42)
    // Seed is fixed per block index so all candidates receive equivalent challenges
    const candidateSeed = this.phaseSeed;
    this.currentTargets = generateBalancedCandidateBattery(candidateSeed);
    this.currentTargetIdx = 0;

    store.updateHud(this.currentTargets.length, 0, 0, 0);
    this.startRoundTimer();

    this.spawnNextTarget();
    this.startSamplingLoop();
  }

  private startRoundTimer() {
    if (this.suspended) return;
    if (this.timerIntervalId) clearInterval(this.timerIntervalId);
    this.roundStartTime = performance.now();
    this.timerIntervalId = (setInterval as any)(() => {
      const elapsed = Math.floor((performance.now() - this.roundStartTime) / 1000);
      const store = useAppStore.getState();
      store.updateHud(store.targetsRemaining, store.hitsCount, store.missesCount, elapsed);
    }, 1000);
  }

  private startSamplingLoop() {
    // Raw sample subscription records every applied input event, independently of rendering.
  }

  /**
   * Spawn next target and record initial T0 state (Task 8)
   */
  private spawnNextTarget() {
    this.cancelPendingSpawn();
    if (!this.isRunning || this.suspended) return;
    if (this.currentTargetIdx >= this.currentTargets.length) {
      this.completeCandidateBlock();
      return;
    }

    const planned = this.currentTargets[this.currentTargetIdx];
    const origin = this.arena.getCameraOrientation();
    const offset = this.arena.getVisibilitySafeOffset(planned.yaw, planned.pitch, planned.radius);
    const targetDef = { ...planned, yaw: origin.yawDeg + offset.yaw,
      pitch: origin.pitchDeg + offset.pitch };
    this.activeTarget = targetDef;
    this.arena.clearTargets();

    const velYaw = targetDef.trajectory ? targetDef.trajectory.yaw * (targetDef.velocity || 0) : 0;
    const velPitch = targetDef.trajectory ? targetDef.trajectory.pitch * (targetDef.velocity || 0) : 0;

    this.arena.spawnTarget(targetDef.yaw, targetDef.pitch, targetDef.radius, velYaw, velPitch, String(targetDef.id));

    this.currentTrialPoints = [];
    this.targetSpawnTime = performance.now();
    this.startingCameraOrientation = this.arena.getCameraOrientation();
    this.pointerLockLostDuringTrial = false;
    this.focusLostDuringTrial = false;
    this.missesOnActiveTarget = 0;
    this.firstShotHit = false;
    this.firstShotHorizontalErrorDeg = 0;
    this.firstShotVerticalErrorDeg = 0;
    this.firstShotTotalErrorDeg = 0;

    // Start high-frequency hardware count capture on RawInputEngine (Task 1)
    this.inputEngine.startTrialCapture();

    // Push initial point at T0
    this.currentTrialPoints.push({
      timestamp: this.targetSpawnTime,
      dx: 0,
      dy: 0,
      yaw: this.startingCameraOrientation.yawDeg,
      pitch: this.startingCameraOrientation.pitchDeg,
      v: 0,
    });
  }

  /**
   * Handle player shot (Task 31, 32, 33, 40)
   */
  private handleShot(shotEvent: ShotEventData) {
    if (!this.isRunning || this.suspended) return;
    const clickTime = shotEvent.shotTimestamp;
    const targetDef = this.activeTarget;
    if (!targetDef || clickTime < this.targetSpawnTime) return;
    if (shotEvent.target && shotEvent.target.id !== String(targetDef.id)) return;

    const targetYaw = shotEvent.targetYawDeg ?? targetDef.yaw;
    const targetPitch = shotEvent.targetPitchDeg ?? targetDef.pitch;
    const isHit = shotEvent.isHit;
    const currentCandidate = this.currentCandidates[this.activeCandidateIdx];
    const isWarmup = useAppStore.getState().phase === 'warmup';

    if (this.missesOnActiveTarget === 0) {
      this.firstShotHit = isHit;
      this.firstShotHorizontalErrorDeg = shotEvent.horizontalErrorDeg ?? 0;
      this.firstShotVerticalErrorDeg = shotEvent.verticalErrorDeg ?? 0;
      this.firstShotTotalErrorDeg = shotEvent.angularErrorDeg ?? 0;
    }

    // Record sample at click time
    this.currentTrialPoints.push({
      timestamp: clickTime,
      dx: 0,
      dy: 0,
      yaw: shotEvent.cameraYawDeg,
      pitch: shotEvent.cameraPitchDeg,
      v: 0,
    });

    if (!isHit) {
      this.missesOnActiveTarget++;
      const store = useAppStore.getState();
      store.updateHud(store.targetsRemaining, store.hitsCount, store.missesCount + 1);

      // If player missed 3 times on the same target, complete trial as a definitive miss to avoid getting stuck
      if (this.missesOnActiveTarget < 3) {
        return;
      }
    }

    // Close the logical trial before telemetry analysis, store notifications or effects.
    this.activeTarget = null;
    this.arena.clearTargets();
    // Trial is completed either through Hit or Miss limit (Task 32, 33)
    const { counts: physicalCounts, samples } = this.inputEngine.endTrialCapture(clickTime);
    this.currentTrialPoints = this.currentTrialPoints.filter(p => p.timestamp <= clickTime);

    if (!isWarmup && currentCandidate) {
      const telemetry = analyzeTrial(
        this.currentTrialPoints,
        targetYaw,
        targetPitch,
        targetDef.radius,
        this.targetSpawnTime,
        clickTime,
        this.pointerLockLostDuringTrial,
        this.focusLostDuringTrial,
        physicalCounts
      );

      const startPoint = this.currentTrialPoints[0] || { yaw: 0, pitch: 0 };
      const deltaYaw = signedYawDelta(targetYaw, startPoint.yaw);
      const deltaPitch = targetPitch - startPoint.pitch;
      const totalAngularDistance = angularDistance(
        startPoint.yaw,
        startPoint.pitch,
        targetDef.yaw,
        targetDef.pitch
      );
      const directionClass = classifyTargetDirection(deltaYaw, deltaPitch);

      const trialResult: TrialResult = {
        id: `t_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        candidateId: currentCandidate.id,
        candidateSens: currentCandidate.sens,
        scenario: (targetDef.scenario as any) || 'medium',
        targetId: `tgt_${targetDef.id}`,
        isValid: telemetry.isValid,
        exclusionReason: !telemetry.isValid ? this.pointerLockLostDuringTrial ? 'POINTER_LOCK_LOST' : this.focusLostDuringTrial ? 'TAB_FOCUS_LOST' : 'UNREALISTIC_LATENCY' : undefined,

        // Spatial
        targetDirection: directionClass,
        targetYawDelta: deltaYaw,
        targetPitchDelta: deltaPitch,
        totalAngularDistance,
        targetRadiusDeg: targetDef.radius,

        // Physical Hardware Counts (Task 2, 3, 4, 17)
        rawCounts: physicalCounts,

        // Timing
        targetSpawnTime: this.targetSpawnTime,
        movementStartTime: this.targetSpawnTime + telemetry.reactionLatency,
        shotTime: clickTime,
        reactionLatencyMs: telemetry.reactionLatency,
        movementTimeMs: telemetry.movementTime,
        totalAcquisitionTimeMs: telemetry.totalAcquisitionTime,

        // Kinematics & Stopping Control (Task 21, 23)
        peakVelocityDegPerSec: telemetry.peakVelocity,
        peakAccelerationDegPerSec2: telemetry.peakAcceleration,
        peakDecelerationDegPerSec2: telemetry.peakDeceleration,
        timeToPeakVelocityMs: telemetry.timeToPeakVelocityMs,
        stoppingControlScore: telemetry.stoppingControlScore,

        // Ballistics & Over/Undershoot (Task 24, 25, 26)
        firstFlickEndpointDeg: {
          yaw: telemetry.flickEndpoint.yaw,
          pitch: telemetry.flickEndpoint.pitch,
        },
        initialFlickErrorDeg: telemetry.initialFlickError,
        isOvershoot: telemetry.isOvershoot,
        overshootMagnitudeDeg: telemetry.overshootMagnitude,
        overshootPercentage: telemetry.overshootPercentage,
        isUndershoot: telemetry.isUndershoot,
        undershootMagnitudeDeg: telemetry.undershootMagnitude,
        undershootPercentage: telemetry.undershootPercentage,

        // Corrections & Path
        correctionCount: telemetry.correctionCount,
        directionReversals: telemetry.directionReversals,
        idealDistanceDeg: telemetry.idealDistance,
        actualPathDistanceDeg: telemetry.actualDistance,
        pathEfficiency: telemetry.pathEfficiency,

        // Endpoint Error & First Shot vs Eventual Hit (Task 18, 19, 20, 29, 31, 32, 33, 34)
        horizontalEndpointErrorDeg: shotEvent.horizontalErrorDeg ?? telemetry.horizontalErrorDeg,
        verticalEndpointErrorDeg: shotEvent.verticalErrorDeg ?? telemetry.verticalErrorDeg,
        totalEndpointErrorDeg: shotEvent.angularErrorDeg ?? telemetry.totalAngularErrorDeg,
        endpointErrorDeg: shotEvent.angularErrorDeg ?? telemetry.totalAngularErrorDeg,
        isHit,
        firstShotHit: this.firstShotHit,
        firstShotHorizontalErrorDeg: this.firstShotHorizontalErrorDeg,
        firstShotVerticalErrorDeg: this.firstShotVerticalErrorDeg,
        firstShotTotalErrorDeg: this.firstShotTotalErrorDeg,
        eventualHit: isHit,
        shotsRequired: this.missesOnActiveTarget + (isHit ? 1 : 0),

        trajectorySummary: telemetry.downsampledTrajectory.map((p) => ({
          t: p.timestamp - this.targetSpawnTime,
          yaw: p.yaw,
          pitch: p.pitch,
          v: p.v,
          dx: p.dx,
          dy: p.dy,
        })),
        targetPosDeg: { yaw: targetYaw, pitch: targetPitch, radius: targetDef.radius },
        rawSamplesCount: samples.length,
        rawTrajectory: samples.map(sample => ({ ...sample })),
        fullTrajectory: this.currentTrialPoints.map(point => ({
          t: point.timestamp - this.targetSpawnTime, yaw: point.yaw, pitch: point.pitch,
          v: point.v, dx: point.dx, dy: point.dy,
        })),
        startPosDeg: { yaw: startPoint.yaw, pitch: startPoint.pitch },
        clickPosDeg: { yaw: shotEvent.cameraYawDeg, pitch: shotEvent.cameraPitchDeg },
      };

      this.trace('trialRecorded', { candidateId: currentCandidate.id, candidateSensitivity: trialResult.candidateSens, isValid: trialResult.isValid, samples: trialResult.rawSamplesCount, shots: trialResult.shotsRequired });
      currentCandidate.trials.push(trialResult);
      if (import.meta.env?.DEV) this.lastTrialTrace = {
        targetSpawn: { timestamp: this.targetSpawnTime, yaw: targetYaw, pitch: targetPitch, id: targetDef.id },
        rawEvents: samples, cameraPath: this.currentTrialPoints.filter(point => point.timestamp <= clickTime),
        click: { timestamp: clickTime, yaw: shotEvent.cameraYawDeg, pitch: shotEvent.cameraPitchDeg },
        shotRay: { origin: shotEvent.rayOrigin, direction: shotEvent.rayDirection },
        intersection: { isHit, hitObjectId: shotEvent.hitObjectId, point: shotEvent.hitPoint },
        telemetry, trialResult,
      };
      useAppStore.getState().addTrialResult(trialResult);
    }

    const store = useAppStore.getState();
    const hits = store.hitsCount + (isHit ? 1 : 0);
    const remaining = Math.max(0, this.currentTargets.length - (this.currentTargetIdx + 1));
    store.updateHud(remaining, hits, store.missesCount);

    this.currentTargetIdx++;
    // The interval also separates candidate blocks and phase transitions.
    this.scheduleNextTarget();
  }

  private completeCandidateBlock() {
    this.arena.clearTargets();
    if (this.sampleIntervalId) {
      cancelAnimationFrame(this.sampleIntervalId);
      this.sampleIntervalId = null;
    }
    if (this.timerIntervalId) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }

    const store = useAppStore.getState();
    const currentPhase = store.phase;

    if (currentPhase === 'warmup') {
      store.setPhase('coarse');
      this.startPhase('coarse');
      return;
    }

    // Evaluate the completed candidate
    const currentCand = this.currentCandidates[this.activeCandidateIdx];
    if (currentCand) {
      try { SensitivityOptimizer.evaluateCandidate(currentCand); }
      catch (error) { this.fail('OPTIMIZER_ERROR', error instanceof Error ? error.message : String(error)); return; }
      this.trace('candidateMetrics', { candidateId: currentCand.id, trialCount: currentCand.trials.length, validTrials: currentCand.trials.filter(isUsableTrial).length, score: currentCand.compositeScore,
        endpointError: currentCand.medianEndpointErrorDeg, firstShotAccuracy: currentCand.firstShotAccuracy });
    }

    // Advance to next candidate in this phase, or transition phases
    this.activeCandidateIdx++;

    if (this.activeCandidateIdx < this.currentCandidates.length) {
      this.startCandidateBlock();
    } else {
      this.transitionNextSearchPhase();
    }
  }

  private transitionNextSearchPhase(skipFatigue = false) {
    try {
    const store = useAppStore.getState();
    const currentPhase = store.phase;
    this.trace('phaseComplete', {candidateCount: this.currentCandidates.length, trialCount: store.allTrialResults.length});
    if (this.currentCandidates.length < 2) { this.fail('ONE_CANDIDATE_ONLY', 'At least two measured sensitivities are required.'); return; }
    if (this.currentCandidates.some(c => !Number.isFinite(c.sens) || !Number.isFinite(c.compositeScore) || c.trials.some(t => t.isValid && !isUsableTrial(t)))) {
      this.fail('INVALID_METRICS', 'Recorded shooting metrics contained invalid numbers. Please retest.'); return;
    }

    // Check fatigue
    const isFatigued = SensitivityOptimizer.detectFatigue(store.allTrialResults);
    if (isFatigued && !skipFatigue) {
      this.phaseBeforeRest = currentPhase as typeof this.phaseBeforeRest;
      this.isRunning = false;
      store.setFatigued(true);
      store.setPhase('rest');
      return;
    }

    if (this.currentCandidates.some(c => c.trials.filter(isUsableTrial).length < MIN_TRIALS_PER_CANDIDATE)) {
      this.fail(store.allTrialResults.length === 0 ? 'NO_TRIALS' : 'CONFIRMATION_INCOMPLETE', 'Each candidate needs more valid shooting trials. Retest with pointer lock and browser focus maintained.');
      return;
    }
    this.phaseSeed += 1009;
    if (currentPhase === 'coarse') {
      this.currentCandidates = SensitivityOptimizer.generatePhase2Candidates(this.currentCandidates);
      this.activeCandidateIdx = 0;
      store.setPhase('bracketing');
      this.startCandidateBlock();
    } else if (currentPhase === 'bracketing') {
      this.currentCandidates = SensitivityOptimizer.generatePhase3Candidates(this.currentCandidates);
      this.activeCandidateIdx = 0;
      store.setPhase('fine');
      this.startCandidateBlock();
    } else if (currentPhase === 'fine') {
      const topCand = SensitivityOptimizer.rankCandidates(this.currentCandidates)[0];
      const bestSens = topCand ? topCand.sens : store.userProfile.currentSens;
      this.provisionalSens = bestSens;
      this.currentCandidates = SensitivityOptimizer.generatePhase4Candidates(bestSens, store.userProfile.currentSens);
      this.activeCandidateIdx = 0;
      store.setPhase('confirmation');
      this.startCandidateBlock();
    } else if (currentPhase === 'confirmation') {
      this.finalizeRecommendation();
    }
    } catch (error) { this.fail('OPTIMIZER_ERROR', error instanceof Error ? error.message : String(error)); }
  }

  public resumeAfterRest() {
    const store = useAppStore.getState();
    store.setFatigued(false);
    if (!this.phaseBeforeRest) return;
    store.setPhase(this.phaseBeforeRest);
    this.phaseBeforeRest = null;
    this.isRunning = true;
    this.transitionNextSearchPhase(true);
  }

  /**
   * Finalize and construct recommendation directly from shooting telemetry (Task 51, 52, 53)
   */
  private finalizeRecommendation() {
    const store = useAppStore.getState();
    const ranked = SensitivityOptimizer.rankCandidates(this.currentCandidates);
    const winner = ranked[0];
    if (!winner || ranked.length < 2 || ranked.some(c => c.trials.filter(isUsableTrial).length < MIN_TRIALS_PER_CANDIDATE)) {
      this.fail(!winner ? 'NO_TRIALS' : ranked.length < 2 ? 'ONE_CANDIDATE_ONLY' : 'CONFIRMATION_INCOMPLETE', 'Additional valid confirmation shooting trials are required.');
      return;
    }

    const currentSens = store.userProfile.currentSens;
    const dpi = store.userProfile.dpi;
    const recommendedSens = Math.round(winner.sens * 1000) / 1000;

    // Strong Performing Range (Task 51)
    const strongCandidates = ranked.filter(c => c.compositeScore >= winner.compositeScore - 3);
    const lowerBound = Math.min(recommendedSens, ...strongCandidates.map(c => c.sens));
    const upperBound = Math.max(recommendedSens, ...strongCandidates.map(c => c.sens));

    const edpi = Math.round(calculateEDPI(dpi, recommendedSens) * 10) / 10;
    const cm360 = Math.round(calculateCmPer360(dpi, recommendedSens) * 10) / 10;

    const currentEdpi = Math.round(calculateEDPI(dpi, currentSens) * 10) / 10;
    const currentCm360 = Math.round(calculateCmPer360(dpi, currentSens) * 10) / 10;

    const pctChange = Math.round(((recommendedSens - currentSens) / currentSens) * 1000) / 10;

    const allTrials = store.allTrialResults;
    const validTrials = allTrials.filter(isUsableTrial);

    const overshoots = validTrials.filter((t) => t.isOvershoot).length;
    const undershoots = validTrials.filter((t) => t.isUndershoot).length;
    const overRate = validTrials.length > 0 ? overshoots / validTrials.length : 0;
    const underRate = validTrials.length > 0 ? undershoots / validTrials.length : 0;

    const overTendency = overRate > 0.35 ? 'High' : overRate > 0.18 ? 'Moderate' : 'Low';
    const underTendency = underRate > 0.35 ? 'High' : underRate > 0.18 ? 'Moderate' : 'Low';

    const avgCorrections =
      validTrials.length > 0
        ? Math.round((validTrials.reduce((s, t) => s + t.correctionCount, 0) / validTrials.length) * 10) / 10
        : 0;

    const medianAcq =
      validTrials.length > 0
        ? Math.round(
            validTrials.map((t) => t.totalAcquisitionTimeMs).sort((a, b) => a - b)[
              Math.floor(validTrials.length / 2)
            ]
          )
        : 0;

    const medianMove =
      validTrials.length > 0
        ? Math.round(
            validTrials.map((t) => t.movementTimeMs).sort((a, b) => a - b)[
              Math.floor(validTrials.length / 2)
            ]
          )
        : 0;

    const pathEffPct =
      validTrials.length > 0
        ? Math.round(
            (validTrials.reduce((s, t) => s + t.pathEfficiency, 0) / validTrials.length) * 1000
          ) / 10
        : 0;

    const hits = validTrials.filter((t) => t.isHit).length;
    const firstHits = validTrials.filter((t) => t.firstShotHit).length;
    const hitAccPct = validTrials.length > 0 ? Math.round((hits / validTrials.length) * 100) : 0;
    const firstShotAccPct = validTrials.length > 0 ? Math.round((firstHits / validTrials.length) * 100) : 0;

    const telemetrySummary = {
      overshootTendency: overTendency as 'Low' | 'Moderate' | 'High',
      undershootTendency: underTendency as 'Low' | 'Moderate' | 'High',
      avgCorrections,
      medianAcquisitionMs: medianAcq,
      medianMovementMs: medianMove,
      pathEfficiencyPct: pathEffPct,
      hitAccuracyPct: hitAccPct,
      firstShotAccuracyPct: firstShotAccPct,
    };

    const isRawActive = store.isRawInputActive;
    const conf = computeConfidence({
      candidates: this.currentCandidates,
      isRawInputActive: isRawActive,
      confirmationAgreement: this.provisionalSens !== null && Math.abs(winner.sens - this.provisionalSens) < 1e-9,
    });

    const explanation = generateExplanation(currentSens, recommendedSens, telemetrySummary);

    // Directional Analysis Results (Task 53)
    const leftScore = winner.directionalAnalysis?.left?.score ?? 0;
    const rightScore = winner.directionalAnalysis?.right?.score ?? 0;
    const verticalScore = winner.directionalAnalysis?.vertical?.score ?? 0;
    const diagonalScore = winner.directionalAnalysis?.diagonal?.score ?? 0;

    let asymmetryNote: string | undefined;
    const lrDelta = leftScore - rightScore;
    if (Math.abs(lrDelta) >= 8) {
      asymmetryNote = lrDelta > 0
        ? `Leftward flick precision (+${lrDelta}%) outperformed rightward acquisition.`
        : `Rightward flick precision (+${Math.abs(lrDelta)}%) outperformed leftward acquisition.`;
    }

    const scenarioAccuracy = (scenario: TrialResult['scenario']) => {
      const measured = winner.trials.filter(t => isUsableTrial(t) && t.scenario === scenario);
      return measured.length ? Math.round(100 * measured.filter(t => t.firstShotHit ?? t.isHit).length / measured.length) : 0;
    };
    const recommendation: FinalRecommendation = {
      trialsCompleted: validTrials.length,
      candidatesTested: new Set(validTrials.map(t => t.candidateSens)).size,
      shotsAnalyzed: allTrials.reduce((sum,t) => sum + (t.shotsRequired ?? 1), 0),
      medianEndpointErrorDeg: median(validTrials.map(t => t.firstShotTotalErrorDeg ?? t.totalEndpointErrorDeg ?? 0)),
      overshootRate: overRate,
      undershootRate: underRate,
      recommendedSens,
      recommendedRange: [lowerBound, upperBound],
      dpi,
      edpi,
      cm360,
      confidence: conf.tier,
      confidenceScore: conf.score,
      currentSens,
      currentEdpi,
      currentCm360,
      percentageChange: pctChange,
      explanation,
      directionalScores: {
        leftAimPct: leftScore,
        rightAimPct: rightScore,
        verticalControlPct: verticalScore,
        diagonalControlPct: diagonalScore,
        asymmetryNote,
      },
      radar: {
        microPrecision: scenarioAccuracy('micro'),
        flickAccuracy: Math.round(winner.firstShotAccuracy * 100),
        targetSwitching: scenarioAccuracy('switching'),
        control: Math.min(100, Math.max(0, Math.round(winner.controlScore))),
        movementEfficiency: Math.min(100, Math.max(0, Math.round(winner.efficiencyScore))),
        consistency: Math.min(100, Math.max(0, Math.round(winner.consistencyScore))),
      },
      telemetrySummary,
      sampleTrajectories: validTrials.slice(-10),
    };

    this.isRunning = false;
    this.trace('resultsPayload', { recommendedSensitivity: recommendation.recommendedSens, recommendedRange: recommendation.recommendedRange, confidence: recommendation.confidenceScore,
      candidateCount: recommendation.candidatesTested, trialCount: recommendation.trialsCompleted, confirmationAgreement: this.provisionalSens !== null && Math.abs(winner.sens-this.provisionalSens)<1e-9 });
    store.completeSession(recommendation);
    this.trace('resultsPersisted', { phase: useAppStore.getState().phase, sameObject: useAppStore.getState().finalRecommendation === recommendation, status: useAppStore.getState().resultStatus });
  }

  public stop() {
    this.cancelPendingSpawn();
    this.activeTarget = null;
    this.isRunning = false;
    if (this.sampleIntervalId) {
      cancelAnimationFrame(this.sampleIntervalId);
      this.sampleIntervalId = null;
    }
    if (this.timerIntervalId) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
    this.inputEngine.endTrialCapture();
    this.unsubscribeSample?.();
    this.unsubscribeSample = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerlockchange', this.onPointerLockChange);
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') window.removeEventListener('blur', this.onBlur);
    this.arena.clearTargets();
  }
}
