/**
 * Domain Type Definitions for VALORANT Precision Sensitivity Finder
 * Rebuilt: Shooting System as the Complete Sensitivity Measurement Engine
 */

export type AimingStyle = 'wrist' | 'arm' | 'hybrid' | 'unknown';

export interface UserSetupProfile {
  dpi: number;
  currentSens: number;
  pollingRate?: number;       // e.g. 1000 Hz
  refreshRate?: number;       // e.g. 144 Hz
  screenResolution: {
    width: number;
    height: number;
  };
  mousepadWidthCm?: number;   // Usable width in cm
  aimingStyle: AimingStyle;
}

export type TestPhase = 
  | 'setup'
  | 'system-check'
  | 'calibration'
  | 'warmup'
  | 'coarse'
  | 'bracketing'
  | 'fine'
  | 'confirmation'
  | 'rest'
  | 'results';

export type ScenarioType = 
  | 'micro'        // Test A: 1°–4°
  | 'medium'       // Test B: 8°–20°
  | 'large'        // Test C: 25°–55°
  | 'switching'    // Test D: Sequential multi-target
  | 'tracking';    // Test E: Moving target

export type TargetDirection =
  | 'LEFT'
  | 'RIGHT'
  | 'UP'
  | 'DOWN'
  | 'UP_LEFT'
  | 'UP_RIGHT'
  | 'DOWN_LEFT'
  | 'DOWN_RIGHT';

export interface TargetDef {
  id: string;
  scenario: ScenarioType;
  yawDeg: number;         // Horizontal angular displacement from camera center
  pitchDeg: number;       // Vertical angular displacement
  angularRadiusDeg: number;
  distanceMeters: number; // 3D distance in arena (default 15m)
  directionClass?: TargetDirection;
  velocityDegPerSec?: {
    yaw: number;
    pitch: number;
  };
  durationMs?: number;    // For moving targets
}

/**
 * High-frequency mouse movement sample captured during Pointer Lock (Task 1)
 */
export interface MouseSample {
  timestamp: number;
  dx: number;
  dy: number;
  accumulatedX: number;
  accumulatedY: number;
  cameraYaw: number;
  cameraPitch: number;
  angularVelocityX: number;
  angularVelocityY: number;
}

export type ExclusionReason = 
  | 'POINTER_LOCK_LOST'
  | 'TAB_FOCUS_LOST'
  | 'UNREALISTIC_LATENCY'
  | 'EXCESSIVE_INACTIVITY'
  | 'SENSOR_STALL'
  | 'UNCONTROLLED_JITTER';

export interface TrialTrajectoryPoint {
  t: number;              // ms relative to trial start
  yaw: number;
  pitch: number;
  v: number;              // instantaneous angular velocity
  dx?: number;
  dy?: number;
}

/**
 * Raw physical count statistics accumulated during an engagement (Tasks 2 & 3)
 */
export interface PhysicalCountStats {
  totalRightCounts: number;
  totalLeftCounts: number;
  netHorizontalCounts: number;
  absoluteHorizontalTravel: number;

  totalUpCounts: number;
  totalDownCounts: number;
  netVerticalCounts: number;
  absoluteVerticalTravel: number;

  totalRawVectorTravel: number; // Σ sqrt(dx² + dy²)
}

/**
 * Complete controlled experiment result for a single target engagement (Task 40)
 */
export interface TrialResult {
  id: string;
  candidateId: string;
  candidateSens: number;
  scenario: ScenarioType;
  targetId: string;
  isValid: boolean;
  exclusionReason?: ExclusionReason;

  // Target spatial parameters (Task 8 & 13)
  targetDirection?: TargetDirection;
  targetYawDelta?: number;
  targetPitchDelta?: number;
  totalAngularDistance?: number;
  targetRadiusDeg?: number;

  // Raw hardware counts (Task 2, 3, 4, 17)
  rawCounts?: PhysicalCountStats;

  // Timing (Task 9, 10, 11, 12, 49)
  targetSpawnTime: number;
  movementStartTime?: number;
  shotTime: number;
  reactionLatencyMs: number;     // ReactionTime = MovementStartTimestamp - TargetSpawnTimestamp
  movementTimeMs: number;        // MovementTime = ShotTimestamp - MovementStartTimestamp
  totalAcquisitionTimeMs: number;// TotalAcquisitionTime = ShotTimestamp - TargetSpawnTimestamp

  // Kinematics (Task 21, 22, 23)
  peakVelocityDegPerSec?: number;
  peakAccelerationDegPerSec2?: number;
  peakDecelerationDegPerSec2?: number;
  timeToPeakVelocityMs?: number;
  stoppingControlScore?: number;  // 0..100 based on deceleration stability

  // Ballistics & Over/Undershoot (Task 24, 25, 26)
  firstFlickEndpointDeg: { yaw: number; pitch: number };
  initialFlickErrorDeg: number;
  isOvershoot: boolean;
  overshootMagnitudeDeg: number;
  overshootPercentage?: number;
  isUndershoot: boolean;
  undershootMagnitudeDeg: number;
  undershootPercentage?: number;

  // Corrections & Path (Task 20, 27, 28)
  correctionCount: number;
  directionReversals?: number;
  idealDistanceDeg: number;
  actualPathDistanceDeg: number;
  pathEfficiency: number;        // IdealDistance / max(ActualDistance, IdealDistance)

  // Endpoint accuracy (Task 20, 29, 31, 32, 33, 34)
  horizontalEndpointErrorDeg?: number;
  verticalEndpointErrorDeg?: number;
  totalEndpointErrorDeg?: number;
  endpointErrorDeg?: number; // Backward compatibility alias
  firstShotHorizontalErrorDeg?: number;
  firstShotVerticalErrorDeg?: number;
  firstShotTotalErrorDeg?: number;
  isHit: boolean;
  firstShotHit?: boolean;
  eventualHit?: boolean;
  shotsRequired?: number;

  // Tracking metrics (Task 39)
  timeOnTargetMs?: number;
  rmsErrorDeg?: number;

  // Compact trajectory for UI visualization (Task 54)
  trajectorySummary: TrialTrajectoryPoint[];
  targetPosDeg: { yaw: number; pitch: number; radius: number };
  startPosDeg: { yaw: number; pitch: number };
  clickPosDeg: { yaw: number; pitch: number };
  rawSamplesCount?: number;
}

export interface DirectionalMetricSummary {
  trialCount: number;
  accuracyRate: number;
  firstShotAccuracyRate: number;
  medianMovementTimeMs: number;
  overshootRate: number;
  undershootRate: number;
  avgCorrections: number;
  pathEfficiencyPct: number;
  medianEndpointErrorDeg: number;
  score: number; // 0..100
}

export interface CandidateSensitivity {
  id: string;                  // e.g. 'c_0'
  blindLabel: string;          // e.g. 'Test Block A'
  multiplier: number;          // relative to S0 (e.g. 0.85)
  sens: number;                // absolute VALORANT sensitivity
  trials: TrialResult[];
  compositeScore: number;      // 0..100

  // 5 Balanced Core Pillars (Task 47, 48)
  precisionScore: number;      // 30%
  consistencyScore: number;    // 25%
  efficiencyScore: number;     // 20%
  speedScore: number;          // 15%
  controlScore: number;        // 10%

  // Aggregated physical metrics (Task 44)
  medianAcquisitionMs: number;
  medianMovementMs: number;
  medianPathEfficiency: number;
  medianEndpointErrorDeg: number;
  overshootRate: number;       // 0..1
  undershootRate: number;      // 0..1
  avgCorrectionCount: number;
  hitRate: number;             // 0..1
  firstShotAccuracy: number;   // 0..1
  stoppingControl: number;     // 0..100

  // Directional performance analysis (Task 14, 15, 16, 43)
  directionalAnalysis: {
    left: DirectionalMetricSummary;
    right: DirectionalMetricSummary;
    vertical: DirectionalMetricSummary;
    diagonal: DirectionalMetricSummary;
  };
}

export interface SearchPhaseState {
  phase: TestPhase;
  candidates: CandidateSensitivity[];
  activeCandidateIndex: number;
  activeTrialIndex: number;
  totalTrialsCompleted: number;
  fatigueDetected: boolean;
}

export type ConfidenceTier = 'LOW' | 'MODERATE' | 'HIGH';

export interface FinalRecommendation {
  trialsCompleted?: number;
  candidatesTested?: number;
  shotsAnalyzed?: number;
  medianEndpointErrorDeg?: number;
  overshootRate?: number;
  undershootRate?: number;
  recommendedSens: number;
  recommendedRange: [number, number]; // Task 51
  dpi: number;
  edpi: number;
  cm360: number;
  confidence: ConfidenceTier;
  confidenceScore: number;    // 0..100
  currentSens: number;
  currentEdpi: number;
  currentCm360: number;
  percentageChange: number;
  explanation: string;

  // Directional Performance Scores (Task 53)
  directionalScores: {
    leftAimPct: number;
    rightAimPct: number;
    verticalControlPct: number;
    diagonalControlPct: number;
    asymmetryNote?: string;
  };

  // Radar / Profile components
  radar: {
    microPrecision: number;   // 0..100
    flickAccuracy: number;
    targetSwitching: number;
    control: number;
    movementEfficiency: number;
    consistency: number;
  };

  // High-level summary telemetry
  telemetrySummary: {
    overshootTendency: 'Low' | 'Moderate' | 'High';
    undershootTendency: 'Low' | 'Moderate' | 'High';
    avgCorrections: number;
    medianAcquisitionMs: number;
    medianMovementMs: number;
    pathEfficiencyPct: number;
    hitAccuracyPct: number;
    firstShotAccuracyPct: number;
  };

  // Sample trajectories to visualize
  sampleTrajectories: TrialResult[];
}
