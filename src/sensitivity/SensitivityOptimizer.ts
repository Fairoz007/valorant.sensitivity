import type {
  CandidateSensitivity,
  TrialResult,
  DirectionalMetricSummary,
} from '../types';
import { MIN_SENS_BOUND, MAX_SENS_BOUND, SCORING_WEIGHTS } from '../config/constants';

export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function medianAbsoluteDeviation(values: number[], med: number): number {
  if (values.length === 0) return 0;
  const devs = values.map((v) => Math.abs(v - med));
  return median(devs);
}

function emptyDirectionSummary(): DirectionalMetricSummary {
  return {
    trialCount: 0,
    accuracyRate: 0,
    firstShotAccuracyRate: 0,
    medianMovementTimeMs: 0,
    overshootRate: 0,
    undershootRate: 0,
    avgCorrections: 0,
    pathEfficiencyPct: 0,
    medianEndpointErrorDeg: 0,
    score: 0,
  };
}

function computeDirectionSummary(trials: TrialResult[]): DirectionalMetricSummary {
  if (trials.length === 0) return emptyDirectionSummary();

  const hits = trials.filter((t) => t.isHit).length;
  const firstHits = trials.filter((t) => t.firstShotHit ?? t.isHit).length;
  const overshoots = trials.filter((t) => t.isOvershoot).length;
  const undershoots = trials.filter((t) => t.isUndershoot).length;
  const movementTimes = trials.map((t) => t.movementTimeMs ?? t.totalAcquisitionTimeMs ?? 300);
  const pathEffs = trials.map((t) => t.pathEfficiency ?? 1.0);
  const endpointErrors = trials.map((t) => t.totalEndpointErrorDeg ?? (t as any).endpointErrorDeg ?? 0);
  const corrections = trials.map((t) => t.correctionCount ?? 0);

  const accRate = hits / trials.length;
  const firstShotAccRate = firstHits / trials.length;
  const medMoveTime = median(movementTimes);
  const overRate = overshoots / trials.length;
  const underRate = undershoots / trials.length;
  const avgCorr = corrections.reduce((a, b) => a + b, 0) / trials.length;
  const avgEff = (pathEffs.reduce((a, b) => a + b, 0) / trials.length) * 100;
  const medError = median(endpointErrors);

  // Directional score combining accuracy, efficiency and low error
  const score = Math.max(
    0,
    Math.min(
      100,
      firstShotAccRate * 40 +
        (avgEff / 100) * 30 +
        Math.max(0, 30 - medError * 25) -
        (overRate > 0.35 ? 10 : 0) -
        (underRate > 0.35 ? 10 : 0)
    )
  );

  return {
    trialCount: trials.length,
    accuracyRate: Math.round(accRate * 100) / 100,
    firstShotAccuracyRate: Math.round(firstShotAccRate * 100) / 100,
    medianMovementTimeMs: Math.round(medMoveTime),
    overshootRate: Math.round(overRate * 100) / 100,
    undershootRate: Math.round(underRate * 100) / 100,
    avgCorrections: Math.round(avgCorr * 10) / 10,
    pathEfficiencyPct: Math.round(avgEff * 10) / 10,
    medianEndpointErrorDeg: Math.round(medError * 100) / 100,
    score: Math.round(score),
  };
}

/**
 * AGENT 5: SENSITIVITY OPTIMIZER
 * Scientific optimization engine comparing candidate sensitivities
 * strictly using recorded shooting kinematics, ballistic flick profiles,
 * stopping control, and directional balance.
 */
export function isUsableTrial(t: TrialResult): boolean {
  return t.isValid && [t.candidateSens, t.totalAcquisitionTimeMs, t.movementTimeMs,
    t.pathEfficiency, t.targetPosDeg?.radius, t.totalEndpointErrorDeg ?? t.endpointErrorDeg,
    t.firstShotTotalErrorDeg ?? t.totalEndpointErrorDeg ?? t.endpointErrorDeg, t.correctionCount].every(v => typeof v === 'number' && Number.isFinite(v))
    && [t.peakVelocityDegPerSec, t.peakAccelerationDegPerSec2, t.peakDecelerationDegPerSec2, t.timeToPeakVelocityMs, t.stoppingControlScore,
      t.targetRadiusDeg, t.initialFlickErrorDeg, t.overshootMagnitudeDeg, t.undershootMagnitudeDeg,
      t.rawSamplesCount].every(v => v === undefined || Number.isFinite(v))
    && t.candidateSens > 0 && t.totalAcquisitionTimeMs >= 65
    && t.targetPosDeg.radius > 0 && (t.targetRadiusDeg === undefined || t.targetRadiusDeg > 0)
    && t.movementTimeMs >= 0 && t.pathEfficiency >= 0 && t.pathEfficiency <= 1;
}

export class SensitivityOptimizer {
  private static distinct(candidates: CandidateSensitivity[]): CandidateSensitivity[] {
    const seen = new Set<number>();
    const step = Math.max(0.001, Math.min(...candidates.map(c => c.sens)) * 0.02);
    return candidates.map(c => {
      let sens = c.sens;
      let offset = 1;
      while (seen.has(sens)) {
        sens = c.sens + (c.sens < (MIN_SENS_BOUND + MAX_SENS_BOUND) / 2 ? 1 : -1) * step * offset++;
        sens = Math.max(MIN_SENS_BOUND, Math.min(MAX_SENS_BOUND, sens));
      }
      seen.add(sens);
      return { ...c, sens };
    });
  }

  static createCandidate(
    id: string,
    label: string,
    sens: number,
    multiplier: number
  ): CandidateSensitivity {
    return {
      id,
      blindLabel: label,
      sens: Math.max(MIN_SENS_BOUND, Math.min(MAX_SENS_BOUND, sens)),
      multiplier,
      trials: [],
      compositeScore: 0,
      precisionScore: 0,
      consistencyScore: 0,
      efficiencyScore: 0,
      speedScore: 0,
      controlScore: 0,
      medianAcquisitionMs: 0,
      medianMovementMs: 0,
      medianPathEfficiency: 0,
      medianEndpointErrorDeg: 0,
      overshootRate: 0,
      undershootRate: 0,
      avgCorrectionCount: 0,
      hitRate: 0,
      firstShotAccuracy: 0,
      stoppingControl: 0,
      directionalAnalysis: {
        left: emptyDirectionSummary(),
        right: emptyDirectionSummary(),
        vertical: emptyDirectionSummary(),
        diagonal: emptyDirectionSummary(),
      },
    };
  }

  /**
   * Phase 1: Coarse exploration (5 blinded candidates spanning ±30% around baseline S0)
   */
  static generatePhase1Candidates(initialSens: number): CandidateSensitivity[] {
    const multipliers = [0.7, 0.85, 1.0, 1.15, 1.3];
    const labels = [
      'Test Block A',
      'Test Block B',
      'Test Block C',
      'Test Block D',
      'Test Block E',
    ];

    let cands = multipliers.map((mult, i) =>
      this.createCandidate(`p1_c${i}`, '', initialSens * mult, mult)
    );

    // Shuffle and assign blinded labels
    cands = shuffleArray(cands);
    cands.forEach((c, i) => {
      c.blindLabel = labels[i];
    });

    return this.distinct(cands);
  }

  /**
   * Phase 2: Bracketing search around the winning region of Phase 1
   */
  static generatePhase2Candidates(rankedPhase1: CandidateSensitivity[]): CandidateSensitivity[] {
    const sortedByScore = this.rankCandidates(rankedPhase1);
    const top = sortedByScore[0] ?? [...rankedPhase1].sort((a,b) => b.compositeScore-a.compositeScore)[0];
    const sens0 = top.sens;
    const mults = [0.92, 1.0, 1.08];
    const labels = ['Refinement Block A', 'Refinement Block B', 'Refinement Block C'];
    const newCands = mults.map((m, i) =>
      this.createCandidate(`p2_c${i}`, labels[i], sens0 * m, m)
    );
    return this.distinct(shuffleArray(newCands));
  }

  /**
   * Phase 3: Fine Search around the top refinement candidate
   */
  static generatePhase3Candidates(rankedPhase2: CandidateSensitivity[]): CandidateSensitivity[] {
    const sortedByScore = this.rankCandidates(rankedPhase2);
    const top = sortedByScore[0] ?? [...rankedPhase2].sort((a,b) => b.compositeScore-a.compositeScore)[0];
    const mults = [0.96, 1.0, 1.04];
    const labels = ['Fine-Tune A', 'Fine-Tune B', 'Fine-Tune C'];
    const newCands = mults.map((m, i) =>
      this.createCandidate(`p3_c${i}`, labels[i], top.sens * m, m)
    );
    return this.distinct(shuffleArray(newCands));
  }

  /**
   * Phase 4: Confirmation battery comparing provisional optimum with ±5% bounds
   */
  static generatePhase4Candidates(provisionalSens: number, currentSens?: number): CandidateSensitivity[] {
    const mults = [0.95, 1.0, 1.05];
    const labels = ['Confirmation A', 'Confirmation B', 'Confirmation C'];
    const newCands = mults.map((m, i) =>
      this.createCandidate(`p4_c${i}`, labels[i], provisionalSens * m, m)
    );
    if (currentSens !== undefined && Math.abs(currentSens - provisionalSens) > provisionalSens * 0.05) {
      newCands.push(this.createCandidate('p4_current', 'Confirmation D', currentSens, currentSens / provisionalSens));
    }
    return this.distinct(shuffleArray(newCands));
  }

  static rankCandidates(candidates: CandidateSensitivity[]): CandidateSensitivity[] {
    candidates.forEach((c) => this.computeCandidateScore(c));
    return [...candidates].filter(c => c.trials.some(isUsableTrial) && Number.isFinite(c.compositeScore)).sort((a, b) => b.compositeScore - a.compositeScore);
  }

  static evaluateCandidate(c: CandidateSensitivity): void {
    this.computeCandidateScore(c);
  }

  /**
   * Compute comprehensive biomechanical score from shooting telemetry (Tasks 44, 45, 46, 47, 48)
   */
  static computeCandidateScore(c: CandidateSensitivity): void {
    if (c.trials.length === 0) return;
    const valid = c.trials.filter(isUsableTrial);
    if (valid.length === 0) return;

    const acqTimes = valid.map((t) => t.totalAcquisitionTimeMs ?? 400);
    const moveTimes = valid.map((t) => t.movementTimeMs ?? t.totalAcquisitionTimeMs ?? 300);
    const pathEffs = valid.map((t) => t.pathEfficiency ?? 1.0);
    const errs = valid.map((t) => t.firstShotTotalErrorDeg ?? t.totalEndpointErrorDeg ?? (t as any).endpointErrorDeg ?? 0);
    const overshoots = valid.filter((t) => t.isOvershoot).length;
    const undershoots = valid.filter((t) => t.isUndershoot).length;
    const corrects = valid.map((t) => t.correctionCount ?? 0);
    const stoppingScores = valid.map((t) => t.stoppingControlScore ?? 75);

    c.medianAcquisitionMs = median(acqTimes);
    c.medianMovementMs = median(moveTimes);
    c.medianPathEfficiency = median(pathEffs);
    c.medianEndpointErrorDeg = median(errs);
    c.overshootRate = overshoots / valid.length;
    c.undershootRate = undershoots / valid.length;
    c.avgCorrectionCount = corrects.reduce((a, b) => a + b, 0) / valid.length;
    c.hitRate = valid.filter((t) => t.isHit).length / valid.length;
    c.firstShotAccuracy = valid.filter((t) => t.firstShotHit ?? t.isHit).length / valid.length;
    c.stoppingControl = median(stoppingScores);

    // Directional Breakdown (Task 14, 15, 16, 43)
    const leftTrials = valid.filter((t) => t.targetDirection === 'LEFT');
    const rightTrials = valid.filter((t) => t.targetDirection === 'RIGHT');
    const verticalTrials = valid.filter(
      (t) => t.targetDirection === 'UP' || t.targetDirection === 'DOWN'
    );
    const diagonalTrials = valid.filter((t) =>
      Boolean(t.targetDirection && ['UP_LEFT', 'UP_RIGHT', 'DOWN_LEFT', 'DOWN_RIGHT'].includes(t.targetDirection))
    );

    c.directionalAnalysis = {
      left: computeDirectionSummary(leftTrials),
      right: computeDirectionSummary(rightTrials),
      vertical: computeDirectionSummary(verticalTrials),
      diagonal: computeDirectionSummary(diagonalTrials),
    };

    // Component scoring
    c.precisionScore = Math.max(0, (100 - c.medianEndpointErrorDeg * 20) * c.firstShotAccuracy);
    const madAcq = medianAbsoluteDeviation(acqTimes, c.medianAcquisitionMs);
    c.consistencyScore = Math.max(0, 100 - madAcq / 10);
    c.efficiencyScore = c.medianPathEfficiency * 100;
    // Fixed batteries share the same target distribution; movement time measures
    // aiming speed without rewarding a lucky faster stimulus reaction.
    c.speedScore = Math.max(0, 100 - c.medianMovementMs / 10);
    c.controlScore = Math.max(0, Math.min(100, c.stoppingControl) - c.avgCorrectionCount * 20);

    // Penalties (Task 45 & 46)
    // Every measured excursion contributes. A 30% overshoot rate should not
    // disappear merely because it falls below an arbitrary binary cutoff.
    const meanNormalizedExcursion = valid.reduce((sum, t) => {
      const radius = Math.max(0.1, t.targetRadiusDeg ?? t.targetPosDeg.radius);
      return sum + Math.min(2, (Math.max(0, t.overshootMagnitudeDeg) + Math.max(0, t.undershootMagnitudeDeg)) / radius);
    }, 0) / valid.length;
    let penalty = c.overshootRate * 15 + c.undershootRate * 10 + meanNormalizedExcursion * 5;
    if (c.avgCorrectionCount > 2.2) penalty += 20;


    // Directional Asymmetry Penalty (Task 43)
    if (c.directionalAnalysis.left.trialCount > 0 && c.directionalAnalysis.right.trialCount > 0) {
      const lrDiff = Math.abs(
        c.directionalAnalysis.left.firstShotAccuracyRate -
          c.directionalAnalysis.right.firstShotAccuracyRate
      );
      if (lrDiff > 0.45) penalty += 10;
    }

    const rawScore =
      c.precisionScore * SCORING_WEIGHTS.precision +
      c.consistencyScore * SCORING_WEIGHTS.consistency +
      c.efficiencyScore * SCORING_WEIGHTS.efficiency +
      c.speedScore * SCORING_WEIGHTS.speed +
      c.controlScore * SCORING_WEIGHTS.control;

    c.compositeScore = Math.max(0, rawScore - penalty);
  }

  static detectFatigue(trials: TrialResult[]): boolean {
    if (trials.length < 20) return false;

    // Compare first 10 baseline trials with recent 10 trials
    const recent = trials.slice(-10);
    const baseline = trials.slice(0, 10);

    const baseMedTime = median(baseline.map((t) => t.movementTimeMs ?? t.totalAcquisitionTimeMs));
    const recentMedTime = median(recent.map((t) => t.movementTimeMs ?? t.totalAcquisitionTimeMs));

    const baseErrVar = medianAbsoluteDeviation(
      baseline.map((t) => t.totalEndpointErrorDeg ?? (t as any).endpointErrorDeg ?? 0),
      median(baseline.map((t) => t.totalEndpointErrorDeg ?? (t as any).endpointErrorDeg ?? 0))
    );
    const recentErrVar = medianAbsoluteDeviation(
      recent.map((t) => t.totalEndpointErrorDeg ?? (t as any).endpointErrorDeg ?? 0),
      median(recent.map((t) => t.totalEndpointErrorDeg ?? (t as any).endpointErrorDeg ?? 0))
    );

    if (recentMedTime > baseMedTime * 1.25 && recentErrVar > baseErrVar * 1.5) {
      return true;
    }
    return false;
  }
}
