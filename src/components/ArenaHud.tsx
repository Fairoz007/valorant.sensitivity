import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { ShieldCheck, Cpu } from 'lucide-react';

interface ArenaHudProps {
  debugActive?: boolean;
  onExitPointerLock?: () => void;
}

export const ArenaHud: React.FC<ArenaHudProps> = ({ debugActive = false }) => {
  const {
    activeCandidate,
    targetsRemaining,
    hitsCount,
    missesCount,
    phase,
    activeCandidateIndex,
    totalCandidates,
    elapsedRoundTimeSec,
    isPointerLocked,
    isRawInputActive,
  } = useAppStore();

  const formattedTime = `${Math.floor(elapsedRoundTimeSec / 60)
    .toString()
    .padStart(2, '0')}:${(Math.floor(elapsedRoundTimeSec) % 60).toString().padStart(2, '0')}`;

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
      {/* Top Tactical HUD Bar */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex items-center gap-6 bg-val-dark/85 backdrop-blur-md border border-val-border/80 px-6 py-2.5 rounded-xl shadow-2xl">
        {/* Block / Round */}
        <div className="text-center font-mono">
          <div className="text-[10px] text-val-muted uppercase tracking-wider">Round</div>
          <div className="text-lg font-bold text-white leading-none mt-1">
            {phase === 'warmup' ? 'Warmup' : `${phase} ${activeCandidateIndex}`} <span className="text-xs text-val-muted font-normal">/ {totalCandidates}</span>
          </div>
        </div>

        <div className="w-px h-7 bg-val-border/80" />

        {/* Blinded Candidate Block (NEVER REVEAL SENSITIVITY VALUE!) */}
        <div className="text-center font-mono">
          <div className="text-[10px] text-val-muted uppercase tracking-wider">Test Battery</div>
          <div className="text-base font-bold text-val-cyan leading-none mt-1">
            {activeCandidate?.blindLabel || 'Warm-up Phase'}
          </div>
        </div>

        <div className="w-px h-7 bg-val-border/80" />

        {/* Targets Remaining */}
        <div className="text-center font-mono">
          <div className="text-[10px] text-val-muted uppercase tracking-wider">Targets</div>
          <div className="text-lg font-bold text-amber-400 leading-none mt-1">
            {targetsRemaining}
          </div>
        </div>

        <div className="w-px h-7 bg-val-border/80" />

        {/* Hits */}
        <div className="text-center font-mono">
          <div className="text-[10px] text-val-muted uppercase tracking-wider">Hits</div>
          <div className="text-lg font-bold text-emerald-400 leading-none mt-1">
            {hitsCount} <span className="text-xs text-val-red">/ {missesCount} misses</span>
          </div>
        </div>

        <div className="w-px h-7 bg-val-border/80" />

        {/* Elapsed Time */}
        <div className="text-center font-mono">
          <div className="text-[10px] text-val-muted uppercase tracking-wider">Time</div>
          <div className="text-lg font-bold text-gray-200 leading-none mt-1">
            {formattedTime}
          </div>
        </div>
      </div>

      {/* Top Left: Hardware Input Status Indicator */}
      <div className="absolute top-4 left-4 flex items-center gap-2 bg-val-dark/70 backdrop-blur border border-val-border/60 px-3 py-1.5 rounded-lg text-xs font-mono text-val-muted">
        <Cpu className={`w-3.5 h-3.5 ${isRawInputActive ? 'text-val-cyan' : 'text-amber-400'}`} />
        <span>
          {isRawInputActive ? 'RAW INPUT (Acceleration Bypassed)' : 'STANDARD INPUT'}
        </span>
      </div>

      {/* Top Right: Pointer Lock Prompt */}
      <div className="absolute top-4 right-4 bg-val-dark/70 backdrop-blur border border-val-border/60 px-3 py-1.5 rounded-lg text-xs font-mono text-val-muted">
        {isPointerLocked ? (
          <span className="flex items-center gap-1.5 text-val-cyan">
            <ShieldCheck className="w-3.5 h-3.5" /> Cursor Captured (Press ESC to unlock)
          </span>
        ) : (
          <span className="text-amber-400 animate-pulse">
            Click inside canvas to capture mouse
          </span>
        )}
      </div>

      {/* Center Reticle / Crosshair - STRICT FIXED VIEWPORT OVERLAY (Task 5) */}
      <div 
        id="shooting-crosshair"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40 select-none"
        style={{ margin: 0, padding: 0 }}
      >
        <div className="relative w-6 h-6 flex items-center justify-center">
          {/* Cyan Tactical Crosshair */}
          <div className={`absolute w-4 h-[2px] ${debugActive ? 'bg-white' : 'bg-val-cyan shadow-[0_0_4px_#00f5d4]'}`} />
          <div className={`absolute h-4 w-[2px] ${debugActive ? 'bg-white' : 'bg-val-cyan shadow-[0_0_4px_#00f5d4]'}`} />
          <div className="w-1 h-1 bg-white rounded-full z-10" />
        </div>
      </div>
    </div>
  );
};
