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
      <div className="absolute top-16 sm:top-20 xl:top-5 left-1/2 transform -translate-x-1/2 grid grid-cols-3 sm:flex items-center justify-between gap-4 sm:gap-6 bg-[#08151d]/90 backdrop-blur-md border border-val-cyan/20 px-4 sm:px-7 py-3 rounded-2xl shadow-[0_12px_40px_#0008] w-[calc(100%-2rem)] max-w-[720px]">
        {/* Block / Round */}
        <div className="text-left font-mono min-w-0">
          <div className="text-[10px] text-val-muted uppercase tracking-wider">Round</div>
          <div className="text-sm sm:text-lg font-bold text-white leading-none mt-1 capitalize whitespace-nowrap">
            {phase === 'warmup' ? 'Warmup' : `${phase} ${activeCandidateIndex}`} <span className="text-xs text-val-muted font-normal">/ {totalCandidates}</span>
          </div>
        </div>

        <div className="hidden sm:block w-px h-7 bg-val-border/80" />

        {/* Blinded Candidate Block (NEVER REVEAL SENSITIVITY VALUE!) */}
        <div className="text-center font-mono">
          <div className="text-[10px] text-val-muted uppercase tracking-wider">Test Battery</div>
          <div className="text-xs sm:text-base font-bold text-val-cyan leading-none mt-1">
            {activeCandidate?.blindLabel || 'Warm-up Phase'}
          </div>
        </div>

        <div className="hidden sm:block w-px h-7 bg-val-border/80" />

        {/* Targets Remaining */}
        <div className="text-center font-mono">
          <div className="text-[10px] text-val-muted uppercase tracking-wider">Targets</div>
          <div className="text-lg font-bold text-amber-400 leading-none mt-1">
            {targetsRemaining}
          </div>
        </div>

        <div className="hidden sm:block w-px h-7 bg-val-border/80" />

        {/* Hits */}
        <div className="text-center font-mono">
          <div className="text-[10px] text-val-muted uppercase tracking-wider">Hits</div>
          <div className="text-lg font-bold text-emerald-400 leading-none mt-1">
            {hitsCount} <span className="block sm:inline text-[10px] sm:text-xs text-rose-300">/ {missesCount} misses</span>
          </div>
        </div>

        <div className="hidden sm:block w-px h-7 bg-val-border/80" />

        {/* Elapsed Time */}
        <div className="text-center font-mono">
          <div className="text-[10px] text-val-muted uppercase tracking-wider">Time</div>
          <div className="text-lg font-bold text-gray-200 leading-none mt-1">
            {formattedTime}
          </div>
        </div>
      </div>

      {/* Top Left: Hardware Input Status Indicator */}
      <div className="absolute top-4 left-4 flex items-center gap-2 bg-[#08151d]/85 backdrop-blur border border-val-cyan/15 px-3 py-2 rounded-xl text-[9px] sm:text-[10px] font-mono text-slate-300 max-w-[48%]">
        <Cpu className={`w-3.5 h-3.5 ${isRawInputActive ? 'text-val-cyan' : 'text-amber-400'}`} />
        <span>
          {isRawInputActive ? 'RAW INPUT · Acceleration bypassed' : 'STANDARD INPUT'}
        </span>
      </div>

      {/* Top Right: Pointer Lock Prompt */}
      <div className="absolute top-4 right-4 bg-[#08151d]/85 backdrop-blur border border-val-cyan/15 px-3 py-2 rounded-xl text-[9px] sm:text-[10px] font-mono text-slate-300 max-w-[45%]">
        {isPointerLocked ? (
          <span className="flex items-center gap-1.5 text-val-cyan">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> Cursor captured · ESC to unlock
          </span>
        ) : (
          <span className="text-amber-400 animate-pulse">
            Click inside canvas to capture mouse
          </span>
        )}
      </div>

      <div className="absolute bottom-5 left-5 flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-300 bg-[#08151d]/80 border border-val-cyan/15 rounded-xl px-4 py-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-val-cyan shadow-[0_0_8px_#00f5d466]" /> Aim battery <span className="text-slate-500">/</span> {phase}
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

