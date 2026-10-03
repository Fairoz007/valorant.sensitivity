import type { MouseSample, PhysicalCountStats } from '../types';
import { VALORANT_YAW_DEG_PER_COUNT } from '../config/constants';

export interface InputDelta {
  timestamp: number;
  dx: number;
  dy: number;
}

export interface InputDebugStats {
  isLocked: boolean;
  rawInputActive: boolean;
  totalEvents: number;
  lastDx: number;
  lastDy: number;
  accumulatedX: number;
  accumulatedY: number;
  eventRateHz: number;
  lastEventTimestamp: number;
  counts: PhysicalCountStats;
}

type DeltaCallback = (dx: number, dy: number, timestamp: number) => void;
type ClickCallback = (button: number, timestamp: number) => void;
type SampleCallback = (sample: MouseSample) => void;

/**
 * AGENT 1: RAW INPUT ENGINEER
 * High-performance, zero-allocation input engine handling Pointer Lock,
 * unadjustedMovement (raw hardware counts without OS curves),
 * high-resolution microsecond timestamps, directional count accumulators,
 * and decoupling from React rendering cycles.
 */
export class RawInputEngine {
  private element: HTMLElement | null = null;
  private locked = false;
  private rawInputSupported = false;
  private rawInputActive = false;

  // Active ring/delta buffer
  private deltas: InputDelta[] = [];
  private eventTimes: number[] = [];
  
  // Trial-specific high-frequency samples (Task 1)
  private trialSamples: MouseSample[] = [];
  private isCapturingTrial = false;

  private mouseDown = false;
  private clicks = 0;

  // Global & Session hardware count accumulators (Tasks 2 & 3)
  private totalEvents = 0;
  private accumulatedX = 0;
  private accumulatedY = 0;
  private lastDx = 0;
  private lastDy = 0;
  private lastEventTimestamp = 0;

  // Granular Directional Accumulators for active trial (Tasks 2, 3, 4)
  private totalRightCounts = 0;
  private totalLeftCounts = 0;
  private totalUpCounts = 0;
  private totalDownCounts = 0;
  private absoluteHorizontalTravel = 0;
  private absoluteVerticalTravel = 0;
  private totalRawVectorTravel = 0;

  // Current orientation context provider (fed from ArenaManager)
  private orientationProvider: ((timestamp?: number) => { yawDeg: number; pitchDeg: number }) | null = null;
  private sensProvider: (() => number) | null = null;

  // Callbacks
  private deltaSubscribers: Set<DeltaCallback> = new Set();
  private clickSubscribers: Set<ClickCallback> = new Set();
  private sampleSubscribers: Set<SampleCallback> = new Set();
  private isListenersAttached = false;
  
  constructor() {
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handlePointerLockChange = this.handlePointerLockChange.bind(this);
    this.handlePointerLockError = this.handlePointerLockError.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.handleFocus = this.handleFocus.bind(this);
  }

  public setOrientationProvider(fn: (timestamp?: number) => { yawDeg: number; pitchDeg: number }, sensFn?: () => number) {
    this.orientationProvider = fn;
    if (sensFn) this.sensProvider = sensFn;
  }

  public subscribeDelta(cb: DeltaCallback): () => void {
    this.deltaSubscribers.add(cb);
    return () => this.deltaSubscribers.delete(cb);
  }

  public subscribeClick(cb: ClickCallback): () => void {
    this.clickSubscribers.add(cb);
    return () => this.clickSubscribers.delete(cb);
  }

  public subscribeSample(cb: SampleCallback): () => void {
    this.sampleSubscribers.add(cb);
    return () => this.sampleSubscribers.delete(cb);
  }

  /**
   * Reset and start recording a high-frequency trial engagement (Task 1 & 8)
   */
  public startTrialCapture(): void {
    this.trialSamples = [];
    this.isCapturingTrial = true;
    this.totalRightCounts = 0;
    this.totalLeftCounts = 0;
    this.totalUpCounts = 0;
    this.totalDownCounts = 0;
    this.absoluteHorizontalTravel = 0;
    this.absoluteVerticalTravel = 0;
    this.totalRawVectorTravel = 0;
  }

  /**
   * Stop capture and retrieve the full recorded trajectory samples and physical counts
   */
  public endTrialCapture(throughTimestamp = Infinity): { samples: MouseSample[]; counts: PhysicalCountStats } {
    this.isCapturingTrial = false;
    const samples = this.trialSamples.filter(sample => sample.timestamp <= throughTimestamp).sort((a, b) => a.timestamp - b.timestamp);
    // Derive engagement counts from exactly the captured events, never from a
    // live accumulator that may already contain movement beyond the click.
    const counts: PhysicalCountStats = { totalRightCounts: 0, totalLeftCounts: 0,
      netHorizontalCounts: 0, absoluteHorizontalTravel: 0, totalUpCounts: 0,
      totalDownCounts: 0, netVerticalCounts: 0, absoluteVerticalTravel: 0, totalRawVectorTravel: 0 };
    for (const sample of samples) {
      counts.totalRightCounts += Math.max(0, sample.dx);
      counts.totalLeftCounts += Math.max(0, -sample.dx);
      counts.totalUpCounts += Math.max(0, -sample.dy);
      counts.totalDownCounts += Math.max(0, sample.dy);
      counts.absoluteHorizontalTravel += Math.abs(sample.dx);
      counts.absoluteVerticalTravel += Math.abs(sample.dy);
      counts.totalRawVectorTravel += Math.hypot(sample.dx, sample.dy);
    }
    counts.netHorizontalCounts = counts.totalRightCounts - counts.totalLeftCounts;
    counts.netVerticalCounts = counts.totalDownCounts - counts.totalUpCounts;
    return { samples, counts };
  }

  public getTrialCounts(): PhysicalCountStats {
    return {
      totalRightCounts: this.totalRightCounts,
      totalLeftCounts: this.totalLeftCounts,
      netHorizontalCounts: this.totalRightCounts - this.totalLeftCounts,
      absoluteHorizontalTravel: this.absoluteHorizontalTravel,
      totalUpCounts: this.totalUpCounts,
      totalDownCounts: this.totalDownCounts,
      netVerticalCounts: this.totalDownCounts - this.totalUpCounts,
      absoluteVerticalTravel: this.absoluteVerticalTravel,
      totalRawVectorTravel: this.totalRawVectorTravel,
    };
  }

  private attachGlobalListeners() {
    if (this.isListenersAttached || typeof document === 'undefined') return;
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.handleBlur);
      window.addEventListener('focus', this.handleFocus);
    }
    this.isListenersAttached = true;
  }

  private detachGlobalListeners() {
    if (!this.isListenersAttached || typeof document === 'undefined') return;
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.handleBlur);
      window.removeEventListener('focus', this.handleFocus);
    }
    this.isListenersAttached = false;
  }

  async requestLock(element: HTMLElement): Promise<{ success: boolean; unadjusted: boolean }> {
    this.element = element;
    this.attachGlobalListeners();
    if (typeof element.requestPointerLock !== 'function') {
      return { success: false, unadjusted: false };
    }

    try {
      // Level 2 unadjusted raw hardware input (bypasses Windows pointer ballistics / mouse acceleration)
      const promise = element.requestPointerLock({
        unadjustedMovement: true
      });
      
      if (promise && typeof promise.then === 'function') {
        await promise;
      }
      // Legacy implementations return void and ignore options: only a promise
      // resolution confirms unadjusted movement support.
      this.rawInputSupported = !!promise && typeof promise.then === 'function';
      this.rawInputActive = this.rawInputSupported;
      this.locked = document.pointerLockElement === element;
      return { success: this.locked, unadjusted: this.rawInputActive && this.locked };
    } catch {
      // Standard pointer lock fallback
      this.rawInputSupported = false;
      this.rawInputActive = false;
      try {
        const fallbackPromise = element.requestPointerLock?.();
        if (fallbackPromise && typeof fallbackPromise.then === 'function') {
          await fallbackPromise;
        }
        this.locked = document.pointerLockElement === element;
        return { success: this.locked, unadjusted: false };
      } catch (fallbackError) {
        console.error("Pointer lock rejected:", fallbackError);
        this.locked = false;
        return { success: false, unadjusted: false };
      }
    }
  }

  unlock(): void {
    if (typeof document !== 'undefined' && document.exitPointerLock && document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.locked = false;
    this.clearPendingInput();
  }

  isLocked(): boolean {
    if (typeof document !== 'undefined') {
      return this.element !== null && document.pointerLockElement === this.element;
    }
    return this.locked;
  }

  isRawInputSupported(): boolean {
    return this.rawInputSupported;
  }

  isRawInputActive(): boolean {
    return this.rawInputActive && this.isLocked();
  }
  
  isMouseDown(): boolean {
    return this.mouseDown;
  }
  
  consumeClicks(): number {
    const c = this.clicks;
    this.clicks = 0;
    return c;
  }

  getDeltas(throughTimestamp = Infinity): InputDelta[] {
    if (this.deltas.length === 0) return [];
    if (this.deltas.every(delta => delta.timestamp <= throughTimestamp)) {
      const currentDeltas = this.deltas;
      this.deltas = [];
      return currentDeltas.sort((a, b) => a.timestamp - b.timestamp);
    }
    const currentDeltas = this.deltas.filter(delta => delta.timestamp <= throughTimestamp);
    this.deltas = this.deltas.filter(delta => delta.timestamp > throughTimestamp);
    currentDeltas.sort((a, b) => a.timestamp - b.timestamp);
    return currentDeltas;
  }

  public clearPendingInput(): void {
    this.deltas = [];
    this.mouseDown = false;
    this.clicks = 0;
    this.lastEventTimestamp = 0;
  }

  private eventTimestamp(event: MouseEvent): number {
    const now = performance.now();
    const timestamp = event.timeStamp;
    if (!Number.isFinite(timestamp) || timestamp <= 0) return now;
    // Old browsers may expose epoch timestamps instead of the performance clock.
    return timestamp > 1e12 ? timestamp - performance.timeOrigin : timestamp;
  }

  getPollingRate(): number {
    const now = performance.now();
    this.eventTimes = this.eventTimes.filter(t => now - t <= 1000);
    return this.eventTimes.length;
  }

  getDebugStats(): InputDebugStats {
    return {
      isLocked: this.isLocked(),
      rawInputActive: this.isRawInputActive(),
      totalEvents: this.totalEvents,
      lastDx: this.lastDx,
      lastDy: this.lastDy,
      accumulatedX: this.accumulatedX,
      accumulatedY: this.accumulatedY,
      eventRateHz: this.getPollingRate(),
      lastEventTimestamp: this.lastEventTimestamp,
      counts: this.getTrialCounts(),
    };
  }

  /**
   * Internal high-frequency event processor.
   * Processes dx, dy from Pointer Lock, updates accumulators,
   * classifies direction, and buffers samples.
   */
  public handleMouseMove(e: MouseEvent) {
    if (!this.isLocked() && this.element !== null) return;
    
    const now = this.eventTimestamp(e);
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;

    this.lastDx = dx;
    this.lastDy = dy;
    this.accumulatedX += dx;
    this.accumulatedY += dy;
    this.totalEvents++;

    // Granular Directional Accumulation (Task 2 & 3 & 4)
    if (dx > 0) {
      this.totalRightCounts += dx;
    } else if (dx < 0) {
      this.totalLeftCounts += Math.abs(dx);
    }
    this.absoluteHorizontalTravel += Math.abs(dx);

    if (dy < 0) {
      this.totalUpCounts += Math.abs(dy); // mouse moving upward
    } else if (dy > 0) {
      this.totalDownCounts += dy;         // mouse moving downward
    }
    this.absoluteVerticalTravel += Math.abs(dy);

    const vectorMagnitude = Math.hypot(dx, dy);
    this.totalRawVectorTravel += vectorMagnitude;

    // Delta buffer for arena animation frame
    this.deltas.push({ timestamp: now, dx, dy });
    this.eventTimes.push(now);
    // Bound polling history even when the debug HUD is closed.
    while (this.eventTimes.length && this.eventTimes[0] < now - 1000) this.eventTimes.shift();
    // Rotate the authoritative camera before recording this event's orientation.
    // React and requestAnimationFrame never sit in the high-frequency path.
    for (const sub of this.deltaSubscribers) sub(dx, dy, now);

    // Compute angular velocity if orientation/sens provider attached
    let camYaw = 0;
    let camPitch = 0;
    let angVx = 0;
    let angVy = 0;

    if (this.orientationProvider) {
      const orientation = this.orientationProvider(now);
      camYaw = orientation.yawDeg;
      camPitch = orientation.pitchDeg;
    }

    const dtMs = this.lastEventTimestamp > 0 ? Math.max(0.1, now - this.lastEventTimestamp) : 16.67;
    const dtSec = dtMs / 1000;
    const sens = this.sensProvider ? this.sensProvider() : 1.0;
    const degPerCount = VALORANT_YAW_DEG_PER_COUNT * sens;

    angVx = (dx * degPerCount) / dtSec;
    angVy = (-dy * degPerCount) / dtSec;

    this.lastEventTimestamp = now;

    // Build MouseSample (Task 1)
    const sample: MouseSample = {
      timestamp: now,
      dx,
      dy,
      accumulatedX: this.accumulatedX,
      accumulatedY: this.accumulatedY,
      cameraYaw: camYaw,
      cameraPitch: camPitch,
      angularVelocityX: angVx,
      angularVelocityY: angVy,
    };

    if (this.isCapturingTrial) {
      this.trialSamples.push(sample);
    }

    // Direct subscriber dispatch
    for (const sub of this.sampleSubscribers) {
      sub(sample);
    }
  }
  
  public handleMouseDown(e: MouseEvent) {
    if (!this.isLocked() && this.element !== null) return;
    if (e.button === 0) {
      this.mouseDown = true;
      this.clicks++;
      const now = this.eventTimestamp(e);
      for (const sub of this.clickSubscribers) {
        sub(0, now);
      }
    }
  }

  public handleMouseUp(e: MouseEvent) {
    if (e.button === 0) {
      this.mouseDown = false;
    }
  }

  private handlePointerLockChange() {
    const isNowLocked = typeof document !== 'undefined' && document.pointerLockElement === this.element;
    this.locked = isNowLocked;

    if (isNowLocked) {
      document.addEventListener('mousemove', this.handleMouseMove);
      document.addEventListener('mousedown', this.handleMouseDown);
      document.addEventListener('mouseup', this.handleMouseUp);
    } else {
      this.clearPendingInput();
      this.rawInputActive = false;
      document.removeEventListener('mousemove', this.handleMouseMove);
      document.removeEventListener('mousedown', this.handleMouseDown);
      document.removeEventListener('mouseup', this.handleMouseUp);
    }
  }

  private handlePointerLockError() {
    this.locked = false;
    this.rawInputActive = false;
  }

  private handleVisibilityChange() {
    if (document.visibilityState === 'hidden' && this.isLocked()) {
      this.unlock();
    }
  }

  private handleBlur() {
    if (this.isLocked()) {
      this.unlock();
    }
  }

  private handleFocus() {
    // Focus regained
  }

  dispose() {
    this.unlock();
    this.detachGlobalListeners();
    
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousemove', this.handleMouseMove);
      document.removeEventListener('mousedown', this.handleMouseDown);
      document.removeEventListener('mouseup', this.handleMouseUp);
    }
    
    this.element = null;
    this.deltas = [];
    this.eventTimes = [];
    this.trialSamples = [];
    this.deltaSubscribers.clear();
    this.clickSubscribers.clear();
    this.sampleSubscribers.clear();
  }
}
