import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

export interface ShootingDebugData {
  isLocked: boolean;
  dx: number;
  dy: number;
  pollingHz: number;
  camYaw: number;
  camPitch: number;
  crosshairX: number;
  crosshairY: number;
  targetId: string;
  targetYaw?: number;
  targetPitch?: number;
  targetDistance: number;
  targetDir?: string;
  totalTravel: number;
  provisionalSensitivity?: number | null;
  sessionTrace?: { timestamp: number; boundary: string; phase: string; details: Record<string, unknown> }[];
  lastShot?: {
    shotTimestamp: number;
    rayOrigin?: { x: number; y: number; z: number };
    rayDirection?: { x: number; y: number; z: number };
    hitPoint?: { x: number; y: number; z: number };
    hitObjectId?: string;
    intersectionCount?: number;
    isHit: boolean;
    horizontalErrorDeg?: number;
    verticalErrorDeg?: number;
    angularErrorDeg: number;
  } | null;
}

interface DebugHudProps {
  getDebugData?: () => ShootingDebugData | null;
  onToggleDebug?: (visible: boolean) => void;
  onToggleAlignmentCheck?: (enabled: boolean) => void;
}

/**
 * TASK 31: SHOOTING DEBUG HUD
 * Toggle with F3 key.
 */
export const DebugHud: React.FC<DebugHudProps> = ({ getDebugData, onToggleDebug, onToggleAlignmentCheck }) => {
  const [visible, setVisible] = useState(false);
  const [alignmentCheck, setAlignmentCheck] = useState(false);
  const [liveData, setLiveData] = useState<ShootingDebugData | null>(null);

  const { activeCandidate, roundIndex, totalRounds, phase, allTrialResults } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3' && !e.repeat) {
        e.preventDefault();
        if (visible) setAlignmentCheck(false);
        setVisible((prev) => !prev);
      }
      if (e.key === 'F4' && visible && !e.repeat) {
        e.preventDefault();
        setAlignmentCheck(previous => !previous);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible]);

  useEffect(() => {
    onToggleDebug?.(visible);
  }, [visible, onToggleDebug]);

  useEffect(() => {
    onToggleAlignmentCheck?.(alignmentCheck);
  }, [alignmentCheck, onToggleAlignmentCheck]);

  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      if (getDebugData) {
        setLiveData(getDebugData());
      }
    }, 50); // 20 Hz update rate

    return () => clearInterval(interval);
  }, [visible, getDebugData]);

  if (!visible) return null;

  const lastTrial = allTrialResults.length > 0 ? allTrialResults[allTrialResults.length - 1] : null;
  const shot = liveData?.lastShot;

  return (
    <div className="absolute top-36 xl:top-24 left-4 z-50 bg-[#07131c]/95 border border-val-cyan/25 rounded-2xl p-4 font-mono text-[10px] leading-relaxed text-gray-200 pointer-events-none shadow-2xl backdrop-blur-md w-[calc(100%-2rem)] max-w-sm space-y-3 max-h-[calc(100svh-12rem)] overflow-y-auto break-words">
      <div className="flex items-center justify-between border-b border-val-border/80 pb-1 text-val-cyan font-bold">
        <span>SHOOTING DEBUG (F3)</span>
        <span className="text-emerald-400">ACTIVE</span>
      </div>
      <div>Green ray · Red center · Yellow hitbox · Cyan trajectory · White crosshair</div>
      <div className="text-yellow-200">F4: {alignmentCheck ? 'Exit stationary alignment check' : 'Stationary alignment check (unscored)'}</div>

      {/* POINTER & RAW INPUT */}
      <div>
        <div className="text-val-muted font-bold tracking-wider uppercase text-[9px]">POINTER & RAW INPUT</div>
        <div className="grid grid-cols-2 gap-x-2">
          <span>Pointer: <b className={liveData?.isLocked ? 'text-emerald-400' : 'text-val-red'}>{liveData?.isLocked ? 'LOCKED' : 'UNLOCKED'}</b></span>
          <span>Polling: <b className="text-val-cyan">{liveData?.pollingHz ?? 0} Hz</b></span>
          <span>dx: <b className="text-white">{liveData?.dx ?? 0}</b></span>
          <span>dy: <b className="text-white">{liveData?.dy ?? 0}</b></span>
        </div>
      </div>

      {/* CAMERA & CROSSHAIR */}
      <div>
        <div className="text-val-muted font-bold tracking-wider uppercase text-[9px]">CAMERA & CROSSHAIR</div>
        <div className="grid grid-cols-2 gap-x-2">
          <span>Yaw: <b className="text-white">{liveData?.camYaw?.toFixed(2) ?? '0.00'}°</b></span>
          <span>Pitch: <b className="text-white">{liveData?.camPitch?.toFixed(2) ?? '0.00'}°</b></span>
          <span>Crosshair X: <b className="text-val-cyan">{liveData?.crosshairX ?? 0}px</b></span>
          <span>Crosshair Y: <b className="text-val-cyan">{liveData?.crosshairY ?? 0}px</b></span>
        </div>
      </div>

      {/* TARGET */}
      <div>
        <div className="text-val-muted font-bold tracking-wider uppercase text-[9px]">TARGET</div>
        <div className="grid grid-cols-2 gap-x-2">
          <span>ID: <b className="text-white">{liveData?.targetId ?? 'NONE'}</b></span>
          <span>Dist: <b className="text-white">{liveData?.targetDistance ?? 15}m</b></span>
          <span>Yaw: <b className="text-white">{liveData?.targetYaw !== undefined ? `${liveData.targetYaw.toFixed(2)}°` : 'N/A'}</b></span>
          <span>Pitch: <b className="text-white">{liveData?.targetPitch !== undefined ? `${liveData.targetPitch.toFixed(2)}°` : 'N/A'}</b></span>
          <span>Sector: <b className="text-amber-400">{liveData?.targetDir ?? 'N/A'}</b></span>
        </div>
      </div>

      {/* SHOT */}
      <div className="border-t border-val-border/60 pt-1">
        <div className="text-val-muted font-bold tracking-wider uppercase text-[9px]">SHOT REGISTRATION</div>
        {shot ? (
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span>Timestamp: <b className="text-white">{shot.shotTimestamp.toFixed(1)}ms</b></span>
              <span>Result: <b className={shot.isHit ? 'text-emerald-400' : 'text-val-red'}>{shot.isHit ? 'HIT' : 'MISS'}</b></span>
            </div>
            <div className="flex justify-between">
              <span>Intersections: <b className="text-white">{shot.intersectionCount ?? 0}</b></span>
              <span>Hit Object: <b className="text-white">{shot.hitObjectId || 'NONE'}</b></span>
            </div>
            {shot.rayOrigin && shot.rayDirection && (
              <div className="text-[8px] text-gray-400">
                Ray Org: ({shot.rayOrigin.x.toFixed(2)}, {shot.rayOrigin.y.toFixed(2)}, {shot.rayOrigin.z.toFixed(2)})<br />
                Ray Dir: ({shot.rayDirection.x.toFixed(2)}, {shot.rayDirection.y.toFixed(2)}, {shot.rayDirection.z.toFixed(2)})
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-500 italic">No shots fired yet</div>
        )}
      </div>

      {/* ERROR */}
      <div>
        <div className="text-val-muted font-bold tracking-wider uppercase text-[9px]">ANGULAR ERROR</div>
        <div className="grid grid-cols-3 gap-x-1">
          <span>H-Err: <b className="text-amber-400">{shot ? `${shot.horizontalErrorDeg?.toFixed(2)}°` : '0.00°'}</b></span>
          <span>V-Err: <b className="text-amber-400">{shot ? `${shot.verticalErrorDeg?.toFixed(2)}°` : '0.00°'}</b></span>
          <span>Total: <b className="text-white">{shot ? `${shot.angularErrorDeg.toFixed(2)}°` : '0.00°'}</b></span>
        </div>
      </div>

      {/* TELEMETRY */}
      <div className="border-t border-val-border/60 pt-1">
        <div className="text-val-muted font-bold tracking-wider uppercase text-[9px]">TELEMETRY</div>
        <div className="grid grid-cols-2 gap-x-2">
          <span>Overshoot: <b className={lastTrial?.isOvershoot ? 'text-amber-400' : 'text-gray-400'}>{lastTrial?.isOvershoot ? 'YES' : 'NO'}</b></span>
          <span>Undershoot: <b className={lastTrial?.isUndershoot ? 'text-amber-400' : 'text-gray-400'}>{lastTrial?.isUndershoot ? 'YES' : 'NO'}</b></span>
          <span>Corrections: <b className="text-white">{lastTrial?.correctionCount ?? 0}</b></span>
          <span>Path Eff: <b className="text-val-cyan">{lastTrial ? Math.round(lastTrial.pathEfficiency * 100) : 0}%</b></span>
          <span>Move Time: <b className="text-white">{lastTrial ? Math.round(lastTrial.movementTimeMs) : 0}ms</b></span>
          <span>Travel: <b className="text-white">{liveData?.totalTravel?.toFixed(0) ?? 0}</b></span>
        </div>
      </div>

      {/* TEST STATE */}
      <div className="border-t border-val-border/60 pt-1 text-[9px]">
        <div>Trials collected: {allTrialResults.length} · Phase: {phase}</div>
        <div>Provisional sensitivity: {liveData?.provisionalSensitivity?.toFixed(5) ?? 'Awaiting fine search'}</div>
        <div className="text-val-muted">Recent pipeline boundaries</div>
        {liveData?.sessionTrace?.slice(-3).map((entry, index) => (
          <div key={`${entry.timestamp}-${index}`} className="break-all">{entry.boundary}: {JSON.stringify(entry.details)}</div>
        ))}
      </div>
      <div className="border-t border-val-border/60 pt-1 flex justify-between text-[9px] text-val-muted">
        <span>Block: <b className="text-white">{activeCandidate?.blindLabel || phase}</b></span>
        <span>Sensitivity: <b className="text-white">{activeCandidate?.sens.toFixed(5) ?? 'Warmup'}</b></span>
        <span>Round {roundIndex}/{totalRounds}</span>
      </div>
    </div>
  );
};
