import type { CandidateSensitivity, ConfidenceTier } from '../types';
import { isUsableTrial } from './SensitivityOptimizer';
import { MIN_TRIALS_PER_CANDIDATE } from '../config/constants';

export interface ConfidenceInput {
  candidates: CandidateSensitivity[];
  isRawInputActive: boolean;
  confirmationAgreement: boolean;
  fatigueDetected?: boolean;
}

export interface ConfidenceOutput {
  tier: ConfidenceTier;
  score: number;
  recommendedRangeMultiplier: number; // e.g. 0.035 for high, 0.065 for moderate, 0.10 for low
  reasons: string[];
}

export function computeConfidence(input: ConfidenceInput): ConfidenceOutput {
  const {
    candidates,
    isRawInputActive,
    confirmationAgreement,
    fatigueDetected = false,
  } = input;

  const reasons: string[] = [];

  if (!candidates || candidates.length === 0) {
    return {
      tier: 'LOW',
      score: 0,
      recommendedRangeMultiplier: 0.10,
      reasons: ['No candidate sensitivity data recorded.'],
    };
  }

  // Count total and valid trials across all candidates
  let totalTrials = 0;
  let validTrials = 0;
  for (const c of candidates) {
    totalTrials += c.trials.length;
    validTrials += c.trials.filter(isUsableTrial).length;
  }

  if (validTrials === 0 || candidates.some(c => !Number.isFinite(c.compositeScore) || !Number.isFinite(c.consistencyScore))) {
    return { tier: 'LOW', score: 0, recommendedRangeMultiplier: 0.10, reasons: ['No finite valid measured candidate metrics.'] };
  }

  const expectedMinTrials = candidates.length * MIN_TRIALS_PER_CANDIDATE;
  const trialCompletenessRatio = expectedMinTrials > 0 ? Math.min(1.0, validTrials / expectedMinTrials) : 0;
  const validityRatio = totalTrials > 0 ? validTrials / totalTrials : 0;

  // 1. Sample Size & Validity (0 to 30 pts)
  let sampleScore = trialCompletenessRatio * 20 + validityRatio * 10;
  if (trialCompletenessRatio < 0.7) {
    reasons.push('Fewer valid trials than required statistical baseline.');
  }
  if (validityRatio < 0.75) {
    reasons.push('High invalid trial rate due to pointer loss, blur, or debounce anomaly.');
  }

  // 2. Confirmation Agreement (0 or 25 pts)
  let confirmationScore = 0;
  if (confirmationAgreement) {
    confirmationScore = 25;
  } else {
    reasons.push('Confirmation test did not strongly validate provisional winner over neighboring values.');
  }

  // 3. Candidate Separation vs Intra-Candidate Variance (0 to 25 pts)
  const ranked = [...candidates].sort((a, b) => b.compositeScore - a.compositeScore);
  let separationScore = 0;
  if (ranked.length >= 2) {
    const margin = ranked[0].compositeScore - ranked[1].compositeScore;
    const avgConsistency = (ranked[0].consistencyScore + ranked[1].consistencyScore) / 2;
    // Higher margin with high consistency yields strong evidence
    const separationRatio = Math.min(1.0, margin / 12.0);
    const consistencyRatio = Math.min(1.0, avgConsistency / 80.0);
    separationScore = separationRatio * 15 + consistencyRatio * 10;

    if (margin < 2.5) {
      reasons.push('Top candidates performed almost identically; sensitivity plateau detected.');
    }
  } else {
    separationScore = 15;
  }

  // 4. Hardware Input & Environment Integrity (0 to 20 pts)
  let hardwareScore = 0;
  if (isRawInputActive) {
    hardwareScore += 20;
  } else {
    hardwareScore += 8;
    reasons.push('OS mouse acceleration bypass (unadjustedMovement) was unavailable.');
  }

  if (fatigueDetected) {
    hardwareScore = Math.max(0, hardwareScore - 8);
    reasons.push('Late-session neuro-muscular fatigue detected in telemetry.');
  }

  // Total raw score [0, 100]
  let totalScore = sampleScore + confirmationScore + separationScore + hardwareScore;

  // Strict Gating Rules to prevent false high confidence:
  // - Must have >= 80% expected trials
  // - Confirmation MUST agree
  // - Cannot have extreme plateau (margin < 4.0)
  const everyCandidateSampled = candidates.every(c => c.trials.filter(isUsableTrial).length >= MIN_TRIALS_PER_CANDIDATE);
  if (!everyCandidateSampled) reasons.push('At least one candidate lacks the required valid trial baseline.');
  const failsHighCriteria =
    !everyCandidateSampled ||
    ranked.length < 2 ||
    trialCompletenessRatio < 0.8 ||
    validityRatio < 0.8 ||
    !confirmationAgreement ||
    fatigueDetected ||
    (ranked.length >= 2 && (ranked[0].compositeScore - ranked[1].compositeScore) < 4.0);

  let tier: ConfidenceTier = 'LOW';
  let recommendedRangeMultiplier = 0.08; // default +/- 8%

  if (trialCompletenessRatio < 0.40) {
    tier = 'LOW';
    recommendedRangeMultiplier = 0.095;
    totalScore = Math.min(48, totalScore);
  } else if (totalScore >= 80 && !failsHighCriteria) {
    tier = 'HIGH';
    recommendedRangeMultiplier = 0.035; // +/- 3.5%
  } else if (totalScore >= 52) {
    tier = 'MODERATE';
    recommendedRangeMultiplier = 0.06; // +/- 6.0%
  } else {
    tier = 'LOW';
    recommendedRangeMultiplier = 0.095; // +/- 9.5%
  }

  // Never report artificial 99%+ unless mathematically verified
  totalScore = Math.min(95, Math.max(10, totalScore));

  return {
    tier,
    score: Math.round(totalScore * 10) / 10,
    recommendedRangeMultiplier,
    reasons,
  };
}
