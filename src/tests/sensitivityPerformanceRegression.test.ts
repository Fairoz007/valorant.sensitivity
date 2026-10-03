import { describe, expect, it } from 'vitest';
import type { TrialResult } from '../types';
import { SensitivityOptimizer } from '../sensitivity/SensitivityOptimizer';
import { computeConfidence } from '../sensitivity/ConfidenceModel';

function measured(overrides: Partial<TrialResult> = {}): TrialResult {
  return {
    id: 'measured', candidateId: 'candidate', candidateSens: 0.3, scenario: 'medium', targetId: 'target',
    isValid: true, targetSpawnTime: 0, shotTime: 300, reactionLatencyMs: 100, movementTimeMs: 200,
    totalAcquisitionTimeMs: 300, idealDistanceDeg: 10, actualPathDistanceDeg: 10, pathEfficiency: 1,
    firstFlickEndpointDeg: { yaw: 10, pitch: 0 }, initialFlickErrorDeg: 0,
    isOvershoot: false, overshootMagnitudeDeg: 0, isUndershoot: false, undershootMagnitudeDeg: 0,
    correctionCount: 0, endpointErrorDeg: 0, isHit: true, firstShotHit: true, stoppingControlScore: 100,
    trajectorySummary: [], targetPosDeg: { yaw: 10, pitch: 0, radius: 1 },
    startPosDeg: { yaw: 0, pitch: 0 }, clickPosDeg: { yaw: 10, pitch: 0 }, ...overrides,
  };
}
function candidate(id: string, overrides: Partial<TrialResult> = {}) {
  const result = SensitivityOptimizer.createCandidate(id, id, 0.3, 1);
  result.trials = Array.from({ length: 13 }, () => measured(overrides));
  SensitivityOptimizer.computeCandidateScore(result);
  return result;
}

describe('measured sensitivity ranking regressions', () => {
  it('fast clean 100% hits beats slow clean and corrected 100% hits', () => {
    const fast = candidate('fast');
    const slow = candidate('slow', { movementTimeMs: 700, totalAcquisitionTimeMs: 800 });
    const corrected = candidate('corrected', { correctionCount: 2, pathEfficiency: 0.6, stoppingControlScore: 45 });
    expect(fast.hitRate).toBe(1);
    expect(slow.hitRate).toBe(1);
    expect(corrected.hitRate).toBe(1);
    expect(fast.compositeScore).toBeGreaterThan(slow.compositeScore);
    expect(fast.compositeScore).toBeGreaterThan(corrected.compositeScore);
  });
  it('penalizes measured subthreshold overshoot rates and excursion magnitudes', () => {
    const clean = candidate('clean');
    const occasional = candidate('occasional');
    occasional.trials[0] = measured({ isOvershoot: true, overshootMagnitudeDeg: 0.2 });
    const severe = candidate('severe');
    severe.trials[0] = measured({ isOvershoot: true, overshootMagnitudeDeg: 2 });
    SensitivityOptimizer.computeCandidateScore(occasional);
    SensitivityOptimizer.computeCandidateScore(severe);
    expect(clean.compositeScore).toBeGreaterThan(occasional.compositeScore);
    expect(occasional.compositeScore).toBeGreaterThan(severe.compositeScore);
    expect(clean.medianMovementMs).toBe(severe.medianMovementMs);
    expect(clean.hitRate).toBe(severe.hitRate);
  });
  it('scores movement speed separately from reaction latency', () => {
    const first = candidate('first');
    const delayedReaction = candidate('delayed', { reactionLatencyMs: 500, totalAcquisitionTimeMs: 700 });
    expect(first.speedScore).toBe(delayedReaction.speedScore);
  });
  it('uses measured stopping control even with identical hits and correction counts', () => {
    expect(candidate('stable').compositeScore).toBeGreaterThan(candidate('unstable', { stoppingControlScore: 20 }).compositeScore);
  });
  it('a measured performance plateau yields a broader moderate range', () => {
    const first = candidate('first');
    const second = candidate('second');
    const confidence = computeConfidence({ candidates: [first, second], isRawInputActive: true, confirmationAgreement: true });
    expect(confidence.tier).not.toBe('HIGH');
    expect(confidence.recommendedRangeMultiplier).toBeGreaterThanOrEqual(0.06);
    expect(confidence.reasons.join(' ')).toContain('plateau');
  });
  it('one undersampled candidate cannot be hidden by the other candidate trial count', () => {
    const first = candidate('first');
    const second = candidate('second');
    second.trials = second.trials.slice(0, 2);
    second.compositeScore = first.compositeScore - 20;
    const confidence = computeConfidence({ candidates: [first, second], isRawInputActive: true, confirmationAgreement: true });
    expect(confidence.tier).not.toBe('HIGH');
    expect(confidence.reasons.join(' ')).toContain('candidate lacks');
  });
});
