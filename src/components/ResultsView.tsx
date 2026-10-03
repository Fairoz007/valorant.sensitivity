import React, { useState } from 'react';
import type { FinalRecommendation } from '../types';
import { useAppStore } from '../store/useAppStore';
import { VisualTrajectory } from './VisualTrajectory';
import {
  Crosshair,
  Copy,
  Check,
  Download,
  RotateCcw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Activity,
  Layers,
  Zap,
  Compass,
} from 'lucide-react';

export const ResultsView: React.FC = () => {
  const { finalRecommendation, resetSession, resultStatus, resultError } = useAppStore();
  return <ResultsContent finalRecommendation={finalRecommendation} resetSession={resetSession} resultStatus={resultStatus} resultError={resultError} />;
};

export const ResultsContent: React.FC<{
  finalRecommendation: FinalRecommendation | null;
  resetSession: () => void;
  resultStatus: 'idle' | 'loading' | 'valid' | 'insufficient-data' | 'error';
  resultError: string | null;
}> = ({ finalRecommendation, resetSession, resultStatus, resultError }) => {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  if (resultStatus === 'loading') {
    return <div role="status" className="max-w-xl mx-auto px-4 py-16 text-center">Calculating your measured recommendation…</div>;
  }
  if (!finalRecommendation || !Number.isFinite(finalRecommendation.recommendedSens) || finalRecommendation.recommendedSens <= 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">{resultStatus === 'error' ? 'Computation Error' : 'Insufficient Data'}</h2>
        <p role="alert" className="text-val-muted mb-6">{resultError || 'Additional valid shooting trials are required to calculate a sensitivity.'}</p>
        <button
          onClick={resetSession}
          className="px-6 py-2.5 bg-val-red text-white font-mono rounded-lg"
        >
          Return to Setup
        </button>
      </div>
    );
  }

  const {
    recommendedSens,
    recommendedRange,
    dpi,
    edpi,
    cm360,
    confidence,
    confidenceScore,
    currentSens,
    currentEdpi,
    currentCm360,
    percentageChange,
    explanation,
    directionalScores,
    radar,
    telemetrySummary,
    sampleTrajectories,
  } = finalRecommendation;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recommendedSens.toFixed(3));
      setCopied(true);
      setCopyError(null);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('Clipboard access was denied. Select and copy the sensitivity value above.');
    }
  };

  const handleExportJson = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(finalRecommendation, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `valorant-sens-finder-${recommendedSens.toFixed(3)}-${Date.now()}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const isFaster = percentageChange > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header Banner */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-val-cyan/10 border border-val-cyan/30 text-val-cyan text-xs font-mono tracking-widest uppercase mb-3">
          <ShieldCheck className="w-3.5 h-3.5" /> Biomechanical Analysis Complete
        </div>
        <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-white font-sans">
          Recommended Sensitivity
        </h1>
        <p className="text-val-muted text-sm max-w-xl mx-auto mt-2">
          Calculated strictly from your measured ballistic accuracy, path efficiency, stopping control, and correction kinematics.
        </p>
      </div>

      {copyError && <p role="alert" className="text-amber-300 text-sm">{copyError}</p>}
      {/* Primary Sensitivity Hero Card */}
      <div className="bg-val-card border-2 border-val-cyan/50 rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-val-cyan via-val-red to-val-cyan" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Big Number & Copy */}
          <div className="lg:col-span-6 text-center lg:text-left space-y-4">
            <span className="text-xs font-mono uppercase tracking-widest text-val-muted">
              Best Performing In-Game Value
            </span>
            <div className="flex items-baseline justify-center lg:justify-start gap-4">
              <span className="text-6xl md:text-7xl font-black font-mono text-white tracking-tight">
                {recommendedSens.toFixed(3)}
              </span>
              <button
                onClick={handleCopy}
                className="p-2.5 rounded-xl bg-val-dark border border-val-border hover:border-val-cyan text-val-cyan transition-all"
                title="Copy to Clipboard"
              >
                {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>

            {/* Range & Confidence Pill */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-1">
              <div className="bg-val-dark px-3.5 py-1.5 rounded-lg border border-val-border text-xs font-mono">
                <span className="text-val-muted">Strong Performing Range:</span>{' '}
                <strong className="text-white">
                  {recommendedRange[0].toFixed(3)} – {recommendedRange[1].toFixed(3)}
                </strong>
              </div>

              <div
                className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold flex items-center gap-1.5 ${
                  confidence === 'HIGH'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                    : confidence === 'MODERATE'
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                    : 'bg-val-red/10 border-val-red/40 text-val-red'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Confidence: {confidence} ({Math.round(confidenceScore)}%)
              </div>
            </div>
          </div>

          {/* Right Column: Physical & Derived Metrics */}
          <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-val-dark p-3.5 rounded-xl border border-val-border">
              <div className="text-[11px] text-val-muted uppercase font-mono">Hardware DPI</div>
              <div className="text-xl font-bold font-mono text-white mt-1">{dpi}</div>
              <div className="text-[10px] text-val-muted mt-0.5">Physical CPI</div>
            </div>

            <div className="bg-val-dark p-3.5 rounded-xl border border-val-border">
              <div className="text-[11px] text-val-muted uppercase font-mono">eDPI</div>
              <div className="text-xl font-bold font-mono text-val-cyan mt-1">{edpi}</div>
              <div className="text-[10px] text-val-muted mt-0.5">Normalized</div>
            </div>

            <div className="bg-val-dark p-3.5 rounded-xl border border-val-border">
              <div className="text-[11px] text-val-muted uppercase font-mono">Physical Turn</div>
              <div className="text-xl font-bold font-mono text-white mt-1">{cm360} cm</div>
              <div className="text-[10px] text-val-muted mt-0.5">Per 360° turn</div>
            </div>

            {/* Current vs Recommended */}
            <div className="bg-val-dark p-3.5 rounded-xl border border-val-border col-span-2 sm:col-span-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-val-muted">Baseline Current:</span>
                <span className="text-gray-300">
                  {currentSens.toFixed(3)} ({currentEdpi} eDPI · {currentCm360} cm/360)
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono mt-2 pt-2 border-t border-val-border/60">
                <span className="text-val-muted">Net Adjustment:</span>
                <span
                  className={`font-bold flex items-center gap-1 ${
                    percentageChange === 0
                      ? 'text-gray-300'
                      : isFaster
                      ? 'text-emerald-400'
                      : 'text-val-cyan'
                  }`}
                >
                  {isFaster ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {percentageChange > 0 ? `+${percentageChange}%` : `${percentageChange}%`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          ['Shots analyzed', finalRecommendation.shotsAnalyzed],
          ['Trials completed', finalRecommendation.trialsCompleted],
          ['Candidates tested', finalRecommendation.candidatesTested],
          ['Median endpoint error', finalRecommendation.medianEndpointErrorDeg === undefined ? undefined : `${finalRecommendation.medianEndpointErrorDeg.toFixed(3)}°`],
          ['Overshoot rate', finalRecommendation.overshootRate === undefined ? undefined : `${Math.round(finalRecommendation.overshootRate * 100)}%`],
          ['Undershoot rate', finalRecommendation.undershootRate === undefined ? undefined : `${Math.round(finalRecommendation.undershootRate * 100)}%`],
        ].map(([label, value]) => <div key={label} className="bg-val-card p-4 rounded-lg border border-val-border"><div className="text-xs text-val-muted">{label}</div><div className="font-mono text-white mt-1">{value ?? 'Not measured'}</div></div>)}
      </div>

      {/* Telemetry Explanation Card (Task 52) */}
      <div className="bg-val-card border border-val-border rounded-xl p-6 shadow-xl">
        <h3 className="text-base font-bold text-white uppercase font-mono mb-2 flex items-center gap-2">
          <Activity className="w-4 h-4 text-val-cyan" />
          Kinematic Telemetry Rationale
        </h3>
        <p className="text-sm text-gray-300 leading-relaxed font-sans">{explanation}</p>
      </div>

      {/* Directional Analysis Card (Task 53) */}
      <div className="bg-val-card border border-val-border rounded-xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white uppercase font-mono flex items-center gap-2">
            <Compass className="w-4 h-4 text-val-cyan" />
            Directional Flick Analysis
          </h3>
          <span className="text-[11px] font-mono text-val-muted">
            Separated Left / Right / Vertical / Diagonal
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-val-dark p-4 rounded-xl border border-val-border text-center">
            <div className="text-xs text-val-muted uppercase font-mono">LEFT AIM</div>
            <div className="text-2xl font-bold font-mono text-val-cyan mt-1">
              {directionalScores.leftAimPct}%
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Horizontal Pull</div>
          </div>

          <div className="bg-val-dark p-4 rounded-xl border border-val-border text-center">
            <div className="text-xs text-val-muted uppercase font-mono">RIGHT AIM</div>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {directionalScores.rightAimPct}%
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Horizontal Push</div>
          </div>

          <div className="bg-val-dark p-4 rounded-xl border border-val-border text-center">
            <div className="text-xs text-val-muted uppercase font-mono">VERTICAL CONTROL</div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              {directionalScores.verticalControlPct}%
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Up / Down Elevation</div>
          </div>

          <div className="bg-val-dark p-4 rounded-xl border border-val-border text-center">
            <div className="text-xs text-val-muted uppercase font-mono">DIAGONAL CONTROL</div>
            <div className="text-2xl font-bold font-mono text-purple-400 mt-1">
              {directionalScores.diagonalControlPct}%
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Compound Vector</div>
          </div>
        </div>

        {directionalScores.asymmetryNote && (
          <div className="bg-val-dark/70 border border-amber-500/30 rounded-lg p-3 text-xs font-mono text-amber-300">
            <strong>Asymmetry Profile:</strong> {directionalScores.asymmetryNote}
          </div>
        )}

        <p className="text-[11px] text-val-muted leading-relaxed font-sans">
          Note: VALORANT uses a unified base sensitivity. Directional telemetry measures natural physiological asymmetry to select a balanced sensitivity that minimizes your weakest sector's error rate.
        </p>
      </div>

      {/* Aim Profile Radar / Component Breakdown */}
      <div className="bg-val-card border border-val-border rounded-xl p-6 shadow-xl space-y-6">
        <h3 className="text-base font-bold text-white uppercase font-mono flex items-center gap-2">
          <Layers className="w-4 h-4 text-val-cyan" />
          Multi-Dimensional Aim Performance
        </h3>

        {/* Progress Bars for the 6 Core Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: 'Micro Precision (1°–4°)', score: radar.microPrecision, color: 'bg-val-cyan' },
            { label: 'Flick Accuracy (8°–20°)', score: radar.flickAccuracy, color: 'bg-val-red' },
            { label: 'Target Switching', score: radar.targetSwitching, color: 'bg-val-cyan' },
            { label: 'Stopping & Deceleration Control', score: radar.control, color: 'bg-purple-400' },
            { label: 'Movement Efficiency', score: radar.movementEfficiency, color: 'bg-emerald-400' },
            { label: 'Inter-Trial Consistency', score: radar.consistency, color: 'bg-amber-400' },
          ].map((item) => (
            <div key={item.label} className="bg-val-dark p-3.5 rounded-lg border border-val-border">
              <div className="flex justify-between items-center text-xs font-mono mb-1.5">
                <span className="text-gray-300">{item.label}</span>
                <span className="text-white font-bold">{Math.round(item.score)} / 100</span>
              </div>
              <div className="w-full bg-val-card rounded-full h-2 overflow-hidden border border-val-border/40">
                <div
                  className={`${item.color} h-full rounded-full transition-all duration-500`}
                  style={{ width: `${Math.min(100, Math.max(0, item.score))}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Secondary Telemetry Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-2">
          <div className="bg-val-dark p-3 rounded-lg border border-val-border text-center">
            <div className="text-[10px] text-val-muted uppercase font-mono">Overshoot Tendency</div>
            <div
              className={`text-sm font-bold font-mono mt-1 ${
                telemetrySummary.overshootTendency === 'High'
                  ? 'text-val-red'
                  : telemetrySummary.overshootTendency === 'Moderate'
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {telemetrySummary.overshootTendency}
            </div>
          </div>

          <div className="bg-val-dark p-3 rounded-lg border border-val-border text-center">
            <div className="text-[10px] text-val-muted uppercase font-mono">Undershoot Tendency</div>
            <div
              className={`text-sm font-bold font-mono mt-1 ${
                telemetrySummary.undershootTendency === 'High'
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {telemetrySummary.undershootTendency}
            </div>
          </div>

          <div className="bg-val-dark p-3 rounded-lg border border-val-border text-center">
            <div className="text-[10px] text-val-muted uppercase font-mono">Avg Corrections</div>
            <div className="text-sm font-bold font-mono text-white mt-1">
              {telemetrySummary.avgCorrections}
            </div>
          </div>

          <div className="bg-val-dark p-3 rounded-lg border border-val-border text-center">
            <div className="text-[10px] text-val-muted uppercase font-mono">Median Motor Time</div>
            <div className="text-sm font-bold font-mono text-white mt-1">
              {telemetrySummary.medianMovementMs} ms
            </div>
          </div>

          <div className="bg-val-dark p-3 rounded-lg border border-val-border text-center">
            <div className="text-[10px] text-val-muted uppercase font-mono">Path Efficiency</div>
            <div className="text-sm font-bold font-mono text-val-cyan mt-1">
              {telemetrySummary.pathEfficiencyPct}%
            </div>
          </div>

          <div className="bg-val-dark p-3 rounded-lg border border-val-border text-center">
            <div className="text-[10px] text-val-muted uppercase font-mono">1st Shot Accuracy</div>
            <div className="text-sm font-bold font-mono text-emerald-400 mt-1">
              {telemetrySummary.firstShotAccuracyPct}%
            </div>
          </div>
        </div>
      </div>

      {/* Visual Movement Analysis (Actual Trajectories) (Task 54) */}
      <VisualTrajectory trials={sampleTrajectories} />

      {/* Bottom Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-val-border/60">
        <button
          onClick={resetSession}
          className="px-5 py-2.5 rounded-lg border border-val-border hover:border-gray-400 text-val-muted hover:text-white font-mono text-xs flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" /> Start New Session
        </button>

        <div className="flex gap-3">
          <button
            onClick={handleExportJson}
            className="px-5 py-2.5 rounded-lg bg-val-dark border border-val-border hover:border-val-cyan text-val-cyan font-mono text-xs flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Export Report (JSON)
          </button>

          <button
            onClick={handleCopy}
            className="px-6 py-2.5 bg-val-red hover:bg-val-darkRed text-white font-bold rounded-lg uppercase tracking-wider font-mono text-xs flex items-center gap-2 shadow-lg shadow-val-red/20"
          >
            <Crosshair className="w-4 h-4" /> Copy {recommendedSens.toFixed(3)}
          </button>
        </div>
      </div>
    </div>
  );
};
