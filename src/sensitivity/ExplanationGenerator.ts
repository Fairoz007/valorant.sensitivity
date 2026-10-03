import type { FinalRecommendation } from '../types';

/** Describe measured session summaries without inventing baseline comparisons or causality. */
export function generateExplanation(
  currentSens: number,
  recommendedSens: number,
  telemetrySummary: FinalRecommendation['telemetrySummary']
): string {
  const difference = ((recommendedSens - currentSens) / currentSens) * 100;
  const change = difference > 0 ? `+${difference.toFixed(1)}` : difference.toFixed(1);
  return `The strongest tested confirmation candidate was ${recommendedSens.toFixed(3)}, compared with your entered sensitivity of ${currentSens.toFixed(3)} (${change}%). ` +
    `Across valid measured trials, first-shot accuracy was ${telemetrySummary.firstShotAccuracyPct}%, path efficiency was ${telemetrySummary.pathEfficiencyPct.toFixed(1)}%, and median movement time was ${telemetrySummary.medianMovementMs} ms. ` +
    `The session averaged ${telemetrySummary.avgCorrections.toFixed(1)} corrections per target; overshooting tendency was ${telemetrySummary.overshootTendency.toLowerCase()} and undershooting tendency was ${telemetrySummary.undershootTendency.toLowerCase()}. ` +
    `The strong-performing range describes similar tested scores. Confidence reflects this session's trial quality and candidate separation; it does not prove a universal optimum.`;
}
