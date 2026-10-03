import React, { useState } from 'react';
import type { TrialResult } from '../types';
import { CheckCircle2, XCircle, ChevronLeft, ChevronRight, Activity } from 'lucide-react';

interface VisualTrajectoryProps {
  trials: TrialResult[];
}

export const VisualTrajectory: React.FC<VisualTrajectoryProps> = ({ trials }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!trials || trials.length === 0) {
    return (
      <div className="bg-val-dark/60 rounded-xl p-8 text-center border border-val-border text-val-muted">
        No trajectory data available.
      </div>
    );
  }

  const trial = trials[selectedIndex] || trials[0];
  const {
    startPosDeg,
    targetPosDeg,
    firstFlickEndpointDeg,
    clickPosDeg,
    trajectorySummary,
    isHit,
    isOvershoot,
    isUndershoot,
    pathEfficiency,
    totalAcquisitionTimeMs,
    correctionCount,
  } = trial;

  // Compute SVG viewport bounding box
  const allPoints = [
    startPosDeg,
    targetPosDeg,
    firstFlickEndpointDeg,
    clickPosDeg,
    ...trajectorySummary.map((p) => ({ yaw: p.yaw, pitch: p.pitch })),
  ];

  const minYaw = Math.min(...allPoints.map((p) => p.yaw));
  const maxYaw = Math.max(...allPoints.map((p) => p.yaw));
  const minPitch = Math.min(...allPoints.map((p) => p.pitch));
  const maxPitch = Math.max(...allPoints.map((p) => p.pitch));

  const padYaw = Math.max(1.5, (maxYaw - minYaw) * 0.25);
  const padPitch = Math.max(1.5, (maxPitch - minPitch) * 0.25);

  const viewBoxMinX = minYaw - padYaw;
  const viewBoxMaxX = maxYaw + padYaw;
  const viewBoxMinY = minPitch - padPitch;
  const viewBoxMaxY = maxPitch + padPitch;

  const width = Math.max(10, viewBoxMaxX - viewBoxMinX);
  const height = Math.max(10, viewBoxMaxY - viewBoxMinY);

  // SVG coordinate transformation:
  // X corresponds to yaw (left to right)
  // Y corresponds to pitch (inverting pitch so up is higher Y visually)
  const mapX = (yaw: number) => ((yaw - viewBoxMinX) / width) * 500;
  const mapY = (pitch: number) => (1 - (pitch - viewBoxMinY) / height) * 350;

  const targetX = mapX(targetPosDeg.yaw);
  const targetY = mapY(targetPosDeg.pitch);
  const targetRadiusPx = Math.max(8, (targetPosDeg.radius / width) * 500);

  const startX = mapX(startPosDeg.yaw);
  const startY = mapY(startPosDeg.pitch);

  const flickX = mapX(firstFlickEndpointDeg.yaw);
  const flickY = mapY(firstFlickEndpointDeg.pitch);

  const clickX = mapX(clickPosDeg.yaw);
  const clickY = mapY(clickPosDeg.pitch);

  const pathPoints = trajectorySummary
    .map((p) => `${mapX(p.yaw).toFixed(1)},${mapY(p.pitch).toFixed(1)}`)
    .join(' ');

  return (
    <div className="bg-val-card border border-val-border rounded-xl p-6 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-val-border/60">
        <div>
          <h3 className="text-base font-bold text-white uppercase font-mono flex items-center gap-2">
            <Activity className="w-4 h-4 text-val-cyan" />
            Mouse Trajectory Analysis
          </h3>
          <p className="text-xs text-val-muted mt-0.5">
            Real recorded 2D angular path showing ballistic flick, over/undershoot, and correction behavior.
          </p>
        </div>

        {/* Trial Selector Pagination */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))}
            disabled={selectedIndex === 0}
            className="p-1.5 rounded bg-val-dark border border-val-border text-val-muted hover:text-white disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs text-val-cyan">
            Sample {selectedIndex + 1} of {trials.length}
          </span>
          <button
            onClick={() => setSelectedIndex((prev) => Math.min(trials.length - 1, prev + 1))}
            disabled={selectedIndex === trials.length - 1}
            className="p-1.5 rounded bg-val-dark border border-val-border text-val-muted hover:text-white disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SVG Trajectory Canvas */}
      <div className="relative bg-val-black rounded-lg border border-val-border/80 overflow-hidden">
        <svg
          viewBox="0 0 500 350"
          className="w-full h-72 md:h-80 select-none"
        >
          {/* Subtle Grid */}
          <defs>
            <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#1d2936" strokeWidth="0.5" />
            </pattern>
            <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f5d4" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#00f5d4" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <rect width="500" height="350" fill="url(#grid)" />

          {/* Ideal Direct Line (dashed) */}
          <line
            x1={startX}
            y1={startY}
            x2={targetX}
            y2={targetY}
            stroke="#475569"
            strokeWidth="1.2"
            strokeDasharray="4 4"
          />

          {/* Actual Mouse Path */}
          {pathPoints && (
            <polyline
              points={pathPoints}
              fill="none"
              stroke="url(#pathGradient)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Target Boundary and Bullseye */}
          <circle
            cx={targetX}
            cy={targetY}
            r={targetRadiusPx}
            fill="#ff4655"
            fillOpacity="0.15"
            stroke="#ff4655"
            strokeWidth="2"
          />
          <circle
            cx={targetX}
            cy={targetY}
            r={Math.max(2, targetRadiusPx * 0.35)}
            fill="#ff4655"
          />

          {/* Start Point */}
          <circle cx={startX} cy={startY} r="5" fill="#10b981" stroke="#064e3b" strokeWidth="1.5" />

          {/* First Ballistic Flick Endpoint */}
          <rect
            x={flickX - 4}
            y={flickY - 4}
            width="8"
            height="8"
            fill="#f59e0b"
            transform={`rotate(45 ${flickX} ${flickY})`}
          />

          {/* Click Endpoint */}
          <circle
            cx={clickX}
            cy={clickY}
            r="4.5"
            fill={isHit ? '#00f5d4' : '#ef4444'}
            stroke="#ffffff"
            strokeWidth="1.2"
          />
        </svg>

        {/* Legend Overlay */}
        <div className="absolute bottom-2 left-2 bg-val-dark/90 backdrop-blur border border-val-border/60 rounded px-2.5 py-1.5 flex flex-wrap gap-3 text-[10px] font-mono text-gray-300">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Start
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-val-red inline-block" /> Target
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 bg-amber-400 rotate-45 inline-block" /> 1st Flick End
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-val-cyan inline-block" /> Click
          </div>
          <div className="flex items-center gap-1">
            <span className="w-4 h-0.5 border-t border-dashed border-gray-400 inline-block" /> Ideal
          </div>
        </div>
      </div>

      {/* Numerical Metrics for this trial */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <div className="bg-val-dark p-2.5 rounded-lg border border-val-border">
          <div className="text-[11px] text-val-muted uppercase font-mono">Result</div>
          <div className="text-sm font-bold flex items-center gap-1.5 mt-0.5">
            {isHit ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-val-cyan" />
                <span className="text-val-cyan font-mono">HIT</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-val-red" />
                <span className="text-val-red font-mono">MISS</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-val-dark p-2.5 rounded-lg border border-val-border">
          <div className="text-[11px] text-val-muted uppercase font-mono">Path Efficiency</div>
          <div className="text-sm font-bold font-mono text-white mt-0.5">
            {Math.round(pathEfficiency * 100)}%
          </div>
        </div>

        <div className="bg-val-dark p-2.5 rounded-lg border border-val-border">
          <div className="text-[11px] text-val-muted uppercase font-mono">Acquisition Time</div>
          <div className="text-sm font-bold font-mono text-white mt-0.5">
            {Math.round(totalAcquisitionTimeMs)} ms
          </div>
        </div>

        <div className="bg-val-dark p-2.5 rounded-lg border border-val-border">
          <div className="text-[11px] text-val-muted uppercase font-mono">Corrections</div>
          <div className="text-sm font-bold font-mono text-white mt-0.5">
            {correctionCount} {isOvershoot ? '(Overshoot)' : isUndershoot ? '(Undershoot)' : '(Crisp)'}
          </div>
        </div>
      </div>
    </div>
  );
};
