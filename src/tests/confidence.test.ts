import { describe, it, expect } from 'vitest';
import { computeConfidence } from '../sensitivity/ConfidenceModel';
import type { CandidateSensitivity, TrialResult } from '../types';

function createMockCandidate(
  id: string,
  score: number,
  validTrialCount: number,
  totalTrialCount: number
): CandidateSensitivity {
  const trials: TrialResult[] = [];
  for (let i = 0; i < totalTrialCount; i++) {
    trials.push({
      id: `t_${id}_${i}`,
      candidateId: id,
      candidateSens: 0.3,
      scenario: 'medium',
      targetId: 'tgt1',
      isValid: i < validTrialCount,
      targetSpawnTime: 0,
      shotTime: 400,
      reactionLatencyMs: 150,
      movementTimeMs: 250,
      totalAcquisitionTimeMs: 400,
      idealDistanceDeg: 10,
      actualPathDistanceDeg: 10.5,
      pathEfficiency: 0.95,
      firstFlickEndpointDeg: { yaw: 10, pitch: 0 },
      initialFlickErrorDeg: 0.2,
      isOvershoot: false,
      overshootMagnitudeDeg: 0,
      isUndershoot: false,
      undershootMagnitudeDeg: 0,
      correctionCount: 0,
      endpointErrorDeg: 0.1,
      isHit: true,
      trajectorySummary: [],
      targetPosDeg: { yaw: 10, pitch: 0, radius: 1.25 },
      startPosDeg: { yaw: 0, pitch: 0 },
      clickPosDeg: { yaw: 10, pitch: 0 },
    });
  }

  return {
    id,
    blindLabel: `Block ${id}`,
    multiplier: 1.0,
    sens: 0.3,
    trials,
    compositeScore: score,
    precisionScore: score,
    consistencyScore: score,
    efficiencyScore: score,
    speedScore: score,
    controlScore: score,
    medianAcquisitionMs: 400,
    medianPathEfficiency: 0.95,
    overshootRate: 0,
    undershootRate: 0,
    avgCorrectionCount: 0.5,
    hitRate: 1.0,
    medianMovementMs: 250,
    medianEndpointErrorDeg: 0.1,
    firstShotAccuracy: 1.0,
    stoppingControl: 85,
    directionalAnalysis: {
      left: { trialCount: 0, accuracyRate: 0, firstShotAccuracyRate: 0, medianMovementTimeMs: 0, overshootRate: 0, undershootRate: 0, avgCorrections: 0, pathEfficiencyPct: 0, medianEndpointErrorDeg: 0, score: 0 },
      right: { trialCount: 0, accuracyRate: 0, firstShotAccuracyRate: 0, medianMovementTimeMs: 0, overshootRate: 0, undershootRate: 0, avgCorrections: 0, pathEfficiencyPct: 0, medianEndpointErrorDeg: 0, score: 0 },
      vertical: { trialCount: 0, accuracyRate: 0, firstShotAccuracyRate: 0, medianMovementTimeMs: 0, overshootRate: 0, undershootRate: 0, avgCorrections: 0, pathEfficiencyPct: 0, medianEndpointErrorDeg: 0, score: 0 },
      diagonal: { trialCount: 0, accuracyRate: 0, firstShotAccuracyRate: 0, medianMovementTimeMs: 0, overshootRate: 0, undershootRate: 0, avgCorrections: 0, pathEfficiencyPct: 0, medianEndpointErrorDeg: 0, score: 0 },
    },
  };
}

describe('ConfidenceModel Calibration (Subagent 5)', () => {
  it('assigns HIGH confidence when sample size, separation, confirmation, and raw input are sound', () => {
    const candidates = [
      createMockCandidate('c1', 88, 10, 10),
      createMockCandidate('c2', 72, 10, 10),
      createMockCandidate('c3', 65, 10, 10),
    ];

    const res = computeConfidence({
      candidates,
      isRawInputActive: true,
      confirmationAgreement: true,
      fatigueDetected: false,
    });

    expect(res.tier).toBe('HIGH');
    expect(res.score).toBeGreaterThanOrEqual(80);
    expect(res.recommendedRangeMultiplier).toBeCloseTo(0.035, 3);
  });

  it('rejects HIGH confidence when top candidates are essentially tied (sensitivity plateau)', () => {
    const candidates = [
      createMockCandidate('c1', 80.2, 10, 10),
      createMockCandidate('c2', 79.9, 10, 10), // Only 0.3 margin!
      createMockCandidate('c3', 68.0, 10, 10),
    ];

    const res = computeConfidence({
      candidates,
      isRawInputActive: true,
      confirmationAgreement: true,
      fatigueDetected: false,
    });

    // Plateau must NOT claim high certainty
    expect(res.tier).not.toBe('HIGH');
    expect(res.recommendedRangeMultiplier).toBeGreaterThan(0.035);
    expect(res.reasons.some((r) => r.includes('plateau'))).toBe(true);
  });

  it('rejects HIGH confidence when confirmation test disagrees with provisional winner', () => {
    const candidates = [
      createMockCandidate('c1', 85, 10, 10),
      createMockCandidate('c2', 70, 10, 10),
    ];

    const res = computeConfidence({
      candidates,
      isRawInputActive: true,
      confirmationAgreement: false, // Disagreement!
    });

    expect(res.tier).not.toBe('HIGH');
    expect(res.score).toBeLessThan(80);
  });

  it('assigns LOW confidence when valid trial count is severely deficient', () => {
    const candidates = [
      createMockCandidate('c1', 85, 2, 8), // Only 2 valid trials
      createMockCandidate('c2', 70, 1, 8),
    ];

    const res = computeConfidence({
      candidates,
      isRawInputActive: true,
      confirmationAgreement: true,
    });

    expect(res.tier).toBe('LOW');
    expect(res.score).toBeLessThan(52);
    expect(res.recommendedRangeMultiplier).toBeCloseTo(0.095, 3);
  });

  it('downgrades score and notes warning when raw input (unadjustedMovement) is unsupported', () => {
    const candidates = [
      createMockCandidate('c1', 85, 10, 10),
      createMockCandidate('c2', 70, 10, 10),
    ];

    const res = computeConfidence({
      candidates,
      isRawInputActive: false, // Standard input / OS acceleration curve active
      confirmationAgreement: true,
    });

    expect(res.reasons.some((r) => r.includes('acceleration bypass'))).toBe(true);
  });
});
