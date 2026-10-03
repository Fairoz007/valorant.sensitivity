import { angularDistance, signedYawDelta, yawPitchToCartesian } from './MathEngine';
import type {
  TargetDirection,
  PhysicalCountStats,
} from '../types';

export interface TelemetryPoint {
  timestamp: number;
  dx: number;
  dy: number;
  yaw: number;
  pitch: number;
  v: number; // instantaneous angular velocity in deg/s
}

export interface DetailedTrialTelemetry {
  isValid: boolean;
  
  // Spatial
  targetDirection: TargetDirection;
  deltaTargetYaw: number;
  deltaTargetPitch: number;
  idealDistance: number;
  actualDistance: number;
  pathEfficiency: number;

  // Timing
  reactionLatency: number;
  movementTime: number;
  totalAcquisitionTime: number;
  timeToPeakVelocityMs: number;

  // Kinematics & Ballistics
  peakVelocity: number;
  peakAcceleration: number; // deg/s^2
  peakDeceleration: number; // positive magnitude, deg/s^2
  stoppingControlScore: number;
  flickEndpoint: { yaw: number; pitch: number; distance: number };
  initialFlickError: number;

  // Over/Undershoot (with backward compatibility aliases)
  isOvershoot: boolean;
  overshoot: number;
  overshootMagnitude: number;
  overshootPercentage: number;
  isUndershoot: boolean;
  undershoot: number;
  undershootMagnitude: number;
  undershootPercentage: number;

  // Corrections & Reversals
  correctionCount: number;
  directionReversals: number;

  // Endpoint accuracy (with backward compatibility aliases)
  endpointError: number;
  horizontalErrorDeg: number;
  verticalErrorDeg: number;
  totalAngularErrorDeg: number;

  downsampledTrajectory: TelemetryPoint[];
}

// Backward compatibility alias for legacy callers
export type TrialTelemetryResult = DetailedTrialTelemetry;

/**
 * Classify 2D target displacement into 8 cardinal/intercardinal sectors (Task 13)
 */
export function classifyTargetDirection(deltaYaw: number, deltaPitch: number): TargetDirection {
  let deg = (Math.atan2(deltaPitch, deltaYaw) * 180) / Math.PI;
  if (deg < 0) deg += 360;

  if (deg >= 337.5 || deg < 22.5) return 'RIGHT';
  if (deg >= 22.5 && deg < 67.5) return 'UP_RIGHT';
  if (deg >= 67.5 && deg < 112.5) return 'UP';
  if (deg >= 112.5 && deg < 157.5) return 'UP_LEFT';
  if (deg >= 157.5 && deg < 202.5) return 'LEFT';
  if (deg >= 202.5 && deg < 247.5) return 'DOWN_LEFT';
  if (deg >= 247.5 && deg < 292.5) return 'DOWN';
  return 'DOWN_RIGHT';
}

/**
 * AGENT 3: MOVEMENT ANALYSIS ENGINEER
 * Deep shooting kinematics analysis converting raw samples into comprehensive TrialTelemetry.
 */
export function analyzeTrial(
  points: TelemetryPoint[],
  targetYaw: number,
  targetPitch: number,
  targetRadius: number,
  targetAppearanceTime: number,
  clickTime: number,
  pointerLockLost: boolean,
  focusLost: boolean,
  _counts?: PhysicalCountStats
): DetailedTrialTelemetry {
  points = points.filter(p => p.timestamp >= targetAppearanceTime && p.timestamp <= clickTime && [p.timestamp, p.yaw, p.pitch, p.dx, p.dy].every(Number.isFinite)).map(p => ({ ...p })).sort((a,b) => a.timestamp - b.timestamp);
  if (points.length === 0) {
    return {
      isValid: false,
      targetDirection: 'RIGHT',
      deltaTargetYaw: 0,
      deltaTargetPitch: 0,
      idealDistance: 0,
      actualDistance: 0,
      pathEfficiency: 1,
      reactionLatency: 0,
      movementTime: 0,
      totalAcquisitionTime: 0,
      timeToPeakVelocityMs: 0,
      peakVelocity: 0,
      peakAcceleration: 0,
      peakDeceleration: 0,
      stoppingControlScore: 50,
      flickEndpoint: { yaw: targetYaw, pitch: targetPitch, distance: 0 },
      initialFlickError: 0,
      isOvershoot: false,
      overshoot: 0,
      overshootMagnitude: 0,
      overshootPercentage: 0,
      isUndershoot: false,
      undershoot: 0,
      undershootMagnitude: 0,
      undershootPercentage: 0,
      correctionCount: 0,
      directionReversals: 0,
      endpointError: 0,
      horizontalErrorDeg: 0,
      verticalErrorDeg: 0,
      totalAngularErrorDeg: 0,
      downsampledTrajectory: [],
    };
  }

  points[0].v = Number.isFinite(points[0].v) && points[0].v >= 0 ? points[0].v : 0;

  // 1. Calculate instantaneous velocities if missing
  for (let i = 1; i < points.length; i++) {
    if (!Number.isFinite(points[i].v) || points[i].v <= 0) {
      const dt = (points[i].timestamp - points[i - 1].timestamp) / 1000;
      if (dt > 0.0001) {
        const dist = angularDistance(
          points[i - 1].yaw,
          points[i - 1].pitch,
          points[i].yaw,
          points[i].pitch
        );
        points[i].v = dist / dt;
      }
    }
  }

  let clickIndex = points.findIndex((p) => p.timestamp >= clickTime);
  if (clickIndex === -1) clickIndex = points.length - 1;

  let isValid = true;
  const totalAcqTime = Math.max(0, clickTime - targetAppearanceTime);
  if (pointerLockLost || focusLost || totalAcqTime < 65) {
    isValid = false;
  }

  // 2. Identify start of deliberate movement (Task 9)
  // Filter out tiny initial sensor noise (< 0.15° cumulative or < 6.0 deg/s)
  let reactionLatency = -1;
  let startIndex = -1;
  let cumulativeDist = 0;

  for (let i = 1; i <= clickIndex; i++) {
    cumulativeDist += angularDistance(
      points[i - 1].yaw,
      points[i - 1].pitch,
      points[i].yaw,
      points[i].pitch
    );
    if (cumulativeDist > 0.15 && (points[i].v > 6.0 || cumulativeDist > 0.35)) {
      startIndex = i;
      reactionLatency = Math.max(0, points[i].timestamp - targetAppearanceTime);
      break;
    }
  }

  if (startIndex === -1 || reactionLatency < 0) {
    startIndex = 0;
    reactionLatency = Math.max(0, points[0].timestamp - targetAppearanceTime);
  }

  const movementTime = Math.max(0, clickTime - points[startIndex].timestamp);

  // 3. Spatial Geometry & Ideal Vector (Task 13, 18)
  const startYaw = points[0].yaw;
  const startPitch = points[0].pitch;
  const deltaTargetYaw = signedYawDelta(targetYaw, startYaw);
  const deltaTargetPitch = targetPitch - startPitch;
  const idealDistance = angularDistance(startYaw, startPitch, targetYaw, targetPitch);
  const targetDirection = classifyTargetDirection(deltaTargetYaw, deltaTargetPitch);

  let actualDistance = 0;
  for (let i = 1; i <= clickIndex; i++) {
    actualDistance += angularDistance(
      points[i - 1].yaw,
      points[i - 1].pitch,
      points[i].yaw,
      points[i].pitch
    );
  }

  const pathEfficiency =
    idealDistance <= 0.001
      ? 1.0
      : Math.max(0.01, Math.min(1.0, idealDistance / Math.max(actualDistance, idealDistance)));

  // 4. Primary Movement Vector Projection (Task 18, 24, 25, 26)
  // Project great-circle displacement onto the target direction in the start
  // orientation's tangent plane. Raw yaw is not angular travel near the poles.
  const start = yawPitchToCartesian(startYaw, startPitch);
  const target = yawPitchToCartesian(targetYaw, targetPitch);
  const dot = (a: typeof start, b: typeof start) => a.x*b.x + a.y*b.y + a.z*b.z;
  const targetDot = dot(start, target);
  const tangent = { x: target.x - start.x*targetDot, y: target.y - start.y*targetDot, z: target.z - start.z*targetDot };
  const tangentLength = Math.hypot(tangent.x, tangent.y, tangent.z);
  const projectedProgress = points.map(p => {
    if (tangentLength < 1e-10) return 0;
    const direction = yawPitchToCartesian(p.yaw, p.pitch);
    const cosine = Math.max(-1, Math.min(1, dot(start, direction)));
    const angle = Math.acos(cosine);
    const sine = Math.sin(angle);
    if (Math.abs(sine) < 1e-10) return 0;
    return angle * 180 / Math.PI * dot(direction, tangent) / (sine * tangentLength);
  });

  let maxP = -Infinity;
  for (let i = 0; i <= clickIndex; i++) {
    const p = projectedProgress[i];
    if (p > maxP) maxP = p;
  }

  // 5. Kinematic Velocity Profile & First Ballistic Flick Endpoint (Task 21, 24)
  let primaryFlickEndIndex = clickIndex;
  let peakVelocity = 0;
  let peakIndex = -1;
  let peakAcceleration = 0;
  let peakDeceleration = 0;
  for (let i = 1; i <= clickIndex; i++) {
    const dt = (points[i].timestamp - points[i-1].timestamp) / 1000;
    if (dt <= 0) continue;
    const acceleration = (points[i].v - points[i-1].v) / dt;
    peakAcceleration = Math.max(peakAcceleration, acceleration);
    peakDeceleration = Math.max(peakDeceleration, -acceleration);
  }

  for (let i = startIndex; i <= clickIndex; i++) {
    if (points[i].v > peakVelocity) {
      peakVelocity = points[i].v;
      peakIndex = i;
    }
  }

  const timeToPeakVelocityMs =
    peakIndex >= startIndex
      ? points[peakIndex].timestamp - points[startIndex].timestamp
      : 0;

  // Ballistic deceleration inflection:
  // After peak velocity (> 15 deg/s), velocity drops below 40% of peak (or < 10 deg/s)
  // and subsequently accelerates again before click.
  if (peakVelocity > 15.0 && peakIndex > -1) {
    for (let i = peakIndex + 1; i < clickIndex; i++) {
      if (
        points[i].v < Math.min(10.0, peakVelocity * 0.4) &&
        points[i + 1].v > points[i].v
      ) {
        primaryFlickEndIndex = i;
        break;
      }
    }
  }

  const pFlick = projectedProgress[primaryFlickEndIndex];

  // 6. Overshoot & Undershoot Geometrical Detection (Task 25, 26)
  let isOvershoot = false;
  let overshootMagnitude = 0;
  let overshootPercentage = 0;

  if (maxP > idealDistance + targetRadius) {
    isOvershoot = true;
    overshootMagnitude = Math.max(0, maxP - idealDistance);
    overshootPercentage = idealDistance > 0 ? (overshootMagnitude / idealDistance) * 100 : 0;
  }

  let isUndershoot = false;
  let undershootMagnitude = 0;
  let undershootPercentage = 0;

  if (pFlick < idealDistance - targetRadius && primaryFlickEndIndex < clickIndex) {
    isUndershoot = true;
    undershootMagnitude = Math.max(0, idealDistance - pFlick);
    undershootPercentage = idealDistance > 0 ? (undershootMagnitude / idealDistance) * 100 : 0;
  }

  // 7. Corrections & Direction Reversals (Task 27, 28)
  let correctionCount = 0;
  let directionReversals = 0;
  let lastSign = 0;
  let lastReversalP = projectedProgress[0];

  for (let i = 1; i <= clickIndex; i++) {
    const vParallel = projectedProgress[i] - projectedProgress[i - 1];
    const currentSign = Math.sign(vParallel);

    if (currentSign !== 0 && currentSign !== lastSign && lastSign !== 0) {
      directionReversals++;
      const excursion = Math.abs(projectedProgress[i] - lastReversalP);
      // Meaningful correction threshold: ignore sensor noise (< 0.12° excursion)
      if (excursion > 0.12) {
        correctionCount++;
      }
      lastReversalP = projectedProgress[i];
    }
    if (currentSign !== 0) {
      lastSign = currentSign;
    }
  }

  // A same-direction secondary push after a ballistic stop is a correction too.
  if (isUndershoot) correctionCount = Math.max(1, correctionCount);

  // 8. Stopping Control & Deceleration Smoothness (Task 23)
  let stoppingControlScore = 100;
  const stoppingWindowStart = Math.max(startIndex, clickIndex - 8);
  let velocitySpikes = 0;

  for (let i = stoppingWindowStart; i < clickIndex; i++) {
    const acc = Math.abs(points[i + 1].v - points[i].v);
    if (acc > 35) velocitySpikes++;
  }

  if (isOvershoot) stoppingControlScore -= 20;
  if (correctionCount > 1) stoppingControlScore -= correctionCount * 12;
  stoppingControlScore -= velocitySpikes * 8;
  stoppingControlScore = Math.max(20, Math.min(100, Math.round(stoppingControlScore)));

  // 9. Angular Endpoint Error & Error Vector at Click (Task 29, 34)
  const clickPoint = points[clickIndex];
  const horizontalErrorDeg = signedYawDelta(clickPoint.yaw, targetYaw);
  const verticalErrorDeg = clickPoint.pitch - targetPitch;
  const totalAngularErrorDeg = angularDistance(
    clickPoint.yaw,
    clickPoint.pitch,
    targetYaw,
    targetPitch
  );

  const initialFlickError = angularDistance(
    points[primaryFlickEndIndex].yaw,
    points[primaryFlickEndIndex].pitch,
    targetYaw,
    targetPitch
  );

  // 10. Downsample Trajectory for Visual Inspection (Task 54)
  const downsampledTrajectory: TelemetryPoint[] = [];
  const stepSize = Math.max(1, Math.floor(points.length / 80));
  for (let i = 0; i < points.length; i += stepSize) {
    downsampledTrajectory.push(points[i]);
  }
  if (downsampledTrajectory[downsampledTrajectory.length - 1] !== clickPoint) {
    downsampledTrajectory.push(clickPoint);
  }

  return {
    isValid,
    targetDirection,
    deltaTargetYaw,
    deltaTargetPitch,
    idealDistance,
    actualDistance,
    pathEfficiency,
    reactionLatency,
    movementTime,
    totalAcquisitionTime: totalAcqTime,
    timeToPeakVelocityMs,
    peakVelocity,
    peakAcceleration,
    peakDeceleration,
    stoppingControlScore,
    flickEndpoint: {
      yaw: points[primaryFlickEndIndex].yaw,
      pitch: points[primaryFlickEndIndex].pitch,
      distance: pFlick,
    },
    initialFlickError,
    isOvershoot,
    overshoot: overshootMagnitude,
    overshootMagnitude,
    overshootPercentage,
    isUndershoot,
    undershoot: undershootMagnitude,
    undershootMagnitude,
    undershootPercentage,
    correctionCount,
    directionReversals,
    endpointError: totalAngularErrorDeg,
    horizontalErrorDeg,
    verticalErrorDeg,
    totalAngularErrorDeg,
    downsampledTrajectory,
  };
}
