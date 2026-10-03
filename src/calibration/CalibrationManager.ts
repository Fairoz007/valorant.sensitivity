/**
 * Calibration Manager
 * Handles system capability verification, robust directional swipe state machine
 * (LEFT ⟷ RIGHT, UP ⟷ DOWN), and debounced primary click calibration.
 */

export interface SystemCheckReport {
  pointerLockSupported: boolean;
  rawInputSupported: boolean;
  rawInputActive: boolean;
  estimatedPollingRateHz: number;
  estimatedRefreshRateHz: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  browserZoom: number;
  isZoomStandard: boolean;
  warnings: string[];
}

export type CalibrationStep = 
  | 'idle'
  | 'horizontal-motion'   // LEFT ⟷ RIGHT
  | 'vertical-motion'     // UP ⟷ DOWN
  | 'click-calibration'   // 3 debounced primary clicks
  | 'complete';

export type MotionDirection = 'NONE' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';

export interface CalibrationMotionStats {
  horizontalSwipes: number;
  verticalSwipes: number;
  horizontalAccumulator: number;
  verticalAccumulator: number;
  currentHorizontalDir: MotionDirection;
  currentVerticalDir: MotionDirection;
  stallsDetected: number;
  lastDx: number;
  lastDy: number;
  totalDistanceX: number;
  totalDistanceY: number;
}

export class CalibrationManager {
  private step: CalibrationStep = 'idle';
  
  // Swipe State Machine Configuration
  private readonly HORIZONTAL_THRESHOLD = 35; // counts before confirming direction / reversal
  private readonly VERTICAL_THRESHOLD = 25;   // counts before confirming vertical direction / reversal
  private readonly MIN_CLICK_INTERVAL_MS = 80;// Debounce threshold

  // Horizontal State
  private horizontalDir: MotionDirection = 'NONE';
  private horizontalAccumulator = 0;
  private horizontalSwipes = 0;
  private totalDistanceX = 0;

  // Vertical State
  private verticalDir: MotionDirection = 'NONE';
  private verticalAccumulator = 0;
  private verticalSwipes = 0;
  private totalDistanceY = 0;

  // Click State
  private clicksCompleted = 0;
  private lastClickTime = 0;

  // Telemetry & Timing
  private lastMotionTime = 0;
  private lastDx = 0;
  private lastDy = 0;
  private stallsDetected = 0;

  public getStep(): CalibrationStep {
    return this.step;
  }

  public setStep(step: CalibrationStep): void {
    this.step = step;
  }

  public getMotionStats(): CalibrationMotionStats {
    return {
      horizontalSwipes: this.horizontalSwipes,
      verticalSwipes: this.verticalSwipes,
      horizontalAccumulator: this.horizontalAccumulator,
      verticalAccumulator: this.verticalAccumulator,
      currentHorizontalDir: this.horizontalDir,
      currentVerticalDir: this.verticalDir,
      stallsDetected: this.stallsDetected,
      lastDx: this.lastDx,
      lastDy: this.lastDy,
      totalDistanceX: this.totalDistanceX,
      totalDistanceY: this.totalDistanceY,
    };
  }

  public getClicksCompleted(): number {
    return this.clicksCompleted;
  }

  /**
   * Run initial browser and display capability detection
   */
  public async performSystemCheck(
    rawInputActive = false
  ): Promise<SystemCheckReport> {
    const warnings: string[] = [];

    const pointerLockSupported = typeof Element !== 'undefined' && 'requestPointerLock' in Element.prototype;
    if (!pointerLockSupported) {
      warnings.push('Pointer Lock API is not supported in this browser.');
    }

    // Pointer Lock support alone does not establish unadjusted input support.
    const rawInputSupported = rawInputActive;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
    
    // outerWidth includes browser chrome and OS scaling; it is not a zoom meter.
    // visualViewport can identify pinch zoom, but desktop browser zoom needs a
    // user check because devicePixelRatio also includes display scaling.
    const zoomRatio = typeof window !== 'undefined' ? window.visualViewport?.scale ?? 1 : 1;
    const isZoomStandard = Math.abs(zoomRatio - 1.0) < 0.01;
    warnings.push('Desktop browser zoom cannot be measured reliably. Reset zoom to 100% (Ctrl+0); display scaling is supported.');
    if (!rawInputActive) warnings.push('Unadjusted input is verified only after an actual Pointer Lock request. Mouse polling rate has not yet been measured.');
    if (!isZoomStandard) {
      warnings.push(`Browser zoom detected at ~${Math.round(zoomRatio * 100)}%. For most consistent measurements, reset zoom to 100% (Ctrl+0).`);
    }

    const refreshRate = await this.estimateRefreshRate();
    if (refreshRate < 55) {
      warnings.push('Display refresh rate appears unusually low (<60 Hz). Background tabs or power saving may affect timing.');
    }

    return {
      pointerLockSupported,
      rawInputSupported,
      rawInputActive,
      estimatedPollingRateHz: 0,
      estimatedRefreshRateHz: refreshRate,
      viewportWidth,
      viewportHeight,
      devicePixelRatio: dpr,
      browserZoom: isZoomStandard ? 0 : Math.round(zoomRatio * 100),
      isZoomStandard,
      warnings,
    };
  }

  private estimateRefreshRate(): Promise<number> {
    if (typeof requestAnimationFrame === 'undefined') return Promise.resolve(0);
    return new Promise((resolve) => {
      let frameCount = 0;
      let startTime = 0;
      const totalFrames = 30;
      let frameId = 0;
      let finished = false;
      const finish = (rate: number) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
        if (frameId && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frameId);
        resolve(Number.isFinite(rate) && rate > 0 ? rate : 0);
      };
      const timeoutId = setTimeout(() => finish(0), 2000);

      const onFrame = (time: DOMHighResTimeStamp) => {
        if (finished) return;
        if (frameCount === 0) startTime = time;
        frameCount++;
        if (frameCount >= totalFrames) {
          const elapsedSec = (time - startTime) / 1000;
          const fps = Math.round((frameCount - 1) / elapsedSec);
          finish(fps);
        } else {
          frameId = requestAnimationFrame(onFrame);
        }
      };

      frameId = requestAnimationFrame(onFrame);
    });
  }

  /**
   * Process mouse delta through directional swipe state machine
   */
  public processCalibrationDelta(dx: number, dy: number, now = performance.now()): void {
    if (this.lastMotionTime > 0) {
      const dt = now - this.lastMotionTime;
      if (dt > 300 && (Math.abs(dx) > 15 || Math.abs(dy) > 15)) {
        this.stallsDetected++;
      }
    }
    this.lastMotionTime = now;
    this.lastDx = dx;
    this.lastDy = dy;

    // STEP 1: Horizontal Motion State Machine (LEFT ⟷ RIGHT)
    if (this.step === 'horizontal-motion') {
      this.totalDistanceX += Math.abs(dx);

      if (this.horizontalDir === 'NONE') {
        this.horizontalAccumulator += dx;
        if (this.horizontalAccumulator >= this.HORIZONTAL_THRESHOLD) {
          this.horizontalDir = 'RIGHT';
          this.horizontalAccumulator = 0;
        } else if (this.horizontalAccumulator <= -this.HORIZONTAL_THRESHOLD) {
          this.horizontalDir = 'LEFT';
          this.horizontalAccumulator = 0;
        }
      } else if (this.horizontalDir === 'RIGHT') {
        if (dx < 0) {
          // Reversing towards left
          this.horizontalAccumulator += Math.abs(dx);
          if (this.horizontalAccumulator >= this.HORIZONTAL_THRESHOLD) {
            // Reversal confirmed!
            this.horizontalSwipes++;
            this.horizontalDir = 'LEFT';
            this.horizontalAccumulator = 0;
          }
        } else if (dx > 0) {
          // Continuing rightward: decay or clamp the reversal accumulator to zero
          this.horizontalAccumulator = Math.max(0, this.horizontalAccumulator - dx);
        }
      } else if (this.horizontalDir === 'LEFT') {
        if (dx > 0) {
          // Reversing towards right
          this.horizontalAccumulator += dx;
          if (this.horizontalAccumulator >= this.HORIZONTAL_THRESHOLD) {
            // Reversal confirmed!
            this.horizontalSwipes++;
            this.horizontalDir = 'RIGHT';
            this.horizontalAccumulator = 0;
          }
        } else if (dx < 0) {
          // Continuing leftward: decay or clamp the reversal accumulator to zero
          this.horizontalAccumulator = Math.max(0, this.horizontalAccumulator - Math.abs(dx));
        }
      }

      // 4 confirmed swipes transition to vertical motion
      if (this.horizontalSwipes >= 4) {
        this.step = 'vertical-motion';
        this.verticalDir = 'NONE';
        this.verticalAccumulator = 0;
      }
    } 
    // STEP 2: Vertical Motion State Machine (UP ⟷ DOWN)
    // Note: browser dy > 0 is downward, dy < 0 is upward
    else if (this.step === 'vertical-motion') {
      this.totalDistanceY += Math.abs(dy);

      if (this.verticalDir === 'NONE') {
        this.verticalAccumulator += dy;
        if (this.verticalAccumulator >= this.VERTICAL_THRESHOLD) {
          this.verticalDir = 'DOWN';
          this.verticalAccumulator = 0;
        } else if (this.verticalAccumulator <= -this.VERTICAL_THRESHOLD) {
          this.verticalDir = 'UP';
          this.verticalAccumulator = 0;
        }
      } else if (this.verticalDir === 'DOWN') {
        if (dy < 0) {
          // Reversing towards UP (dy is negative)
          this.verticalAccumulator += Math.abs(dy);
          if (this.verticalAccumulator >= this.VERTICAL_THRESHOLD) {
            // Reversal to UP confirmed!
            this.verticalSwipes++;
            this.verticalDir = 'UP';
            this.verticalAccumulator = 0;
          }
        } else if (dy > 0) {
          // Continuing downward: decay or clamp the reversal accumulator to zero
          this.verticalAccumulator = Math.max(0, this.verticalAccumulator - dy);
        }
      } else if (this.verticalDir === 'UP') {
        if (dy > 0) {
          // Reversing towards DOWN (dy is positive)
          this.verticalAccumulator += dy;
          if (this.verticalAccumulator >= this.VERTICAL_THRESHOLD) {
            // Reversal to DOWN confirmed!
            this.verticalSwipes++;
            this.verticalDir = 'DOWN';
            this.verticalAccumulator = 0;
          }
        } else if (dy < 0) {
          // Continuing upward: decay or clamp the reversal accumulator to zero
          this.verticalAccumulator = Math.max(0, this.verticalAccumulator - Math.abs(dy));
        }
      }

      // 4 confirmed vertical swipes transition to click calibration
      if (this.verticalSwipes >= 4) {
        this.step = 'click-calibration';
      }
    }
  }

  /**
   * Register click during click calibration with debounce protection
   */
  public registerCalibrationClick(button = 0, now = performance.now()): boolean {
    if (this.step !== 'click-calibration') return false;
    if (button !== 0) return false; // Primary left click only

    if (this.lastClickTime > 0 && (now - this.lastClickTime) < this.MIN_CLICK_INTERVAL_MS) {
      // Accidental bounce / hardware double click, ignore
      return false;
    }

    this.lastClickTime = now;
    this.clicksCompleted++;

    if (this.clicksCompleted >= 3) {
      this.step = 'complete';
      return true;
    }
    return false;
  }

  public reset(): void {
    this.step = 'idle';
    this.horizontalDir = 'NONE';
    this.horizontalAccumulator = 0;
    this.horizontalSwipes = 0;
    this.totalDistanceX = 0;

    this.verticalDir = 'NONE';
    this.verticalAccumulator = 0;
    this.verticalSwipes = 0;
    this.totalDistanceY = 0;

    this.clicksCompleted = 0;
    this.lastClickTime = 0;
    this.lastMotionTime = 0;
    this.lastDx = 0;
    this.lastDy = 0;
    this.stallsDetected = 0;
  }
}

export const calibrationManager = new CalibrationManager();
