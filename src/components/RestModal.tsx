import React, { useEffect, useState, useRef } from 'react';
import { Coffee, Play, AlertCircle } from 'lucide-react';

interface RestModalProps {
  durationSeconds?: number;
  fatigueWarning?: boolean;
  onComplete: () => void;
}

export const RestModal: React.FC<RestModalProps> = ({
  durationSeconds = 20,
  fatigueWarning = false,
  onComplete,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(durationSeconds);

  const callbackRef = useRef(onComplete);
  useEffect(() => { callbackRef.current = onComplete; }, [onComplete]);
  const completedRef = useRef(false);
  const complete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    callbackRef.current();
  };

  useEffect(() => {
    completedRef.current = false;
    const deadline = Date.now() + durationSeconds * 1000;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0 && !completedRef.current) {
        completedRef.current = true;
        clearInterval(interval);
        callbackRef.current();
      }
    }, 250);
    return () => clearInterval(interval);
  }, [durationSeconds]);

  return (
    <div className="fixed inset-0 z-50 bg-[#040b12]/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-labelledby="rest-title" className="bg-[#0b1923]/95 border border-val-cyan/20 rounded-3xl p-6 sm:p-10 max-w-md w-full text-center shadow-[0_24px_100px_#000a] relative overflow-hidden">
        <div className="absolute top-0 left-12 right-12 h-px bg-gradient-to-r from-transparent via-val-cyan to-transparent" />

        <div className="w-14 h-14 rounded-2xl bg-val-cyan/10 border border-val-cyan/25 flex items-center justify-center mx-auto text-val-cyan mb-6">
          <Coffee className="w-8 h-8" />
        </div>

        <p className="text-[10px] uppercase tracking-[0.25em] text-val-cyan mb-3 font-mono">Recovery interval</p>
        <h3 id="rest-title" className="text-2xl font-bold tracking-tight text-white mb-3">
          Tactical Rest Interval
        </h3>

        {fatigueWarning ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 my-4 text-xs text-amber-300 flex items-start gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              <strong>Fatigue Advisory:</strong> Your telemetry indicates slight degradation in movement reaction
              or stability. Resting briefly resets neuro-muscular readiness for cleaner data.
            </p>
          </div>
        ) : (
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            Relax your wrist and forearm. Scientific aim testing requires consistent neuromuscular freshness to isolate sensitivity.
          </p>
        )}

        {/* Countdown Ring / Display */}
        <div className="my-6">
          <div className="inline-flex items-center justify-center w-28 h-28 rounded-full border border-val-cyan/40 ring-8 ring-val-cyan/5 text-4xl font-bold tabular-nums font-mono text-val-cyan shadow-[0_0_32px_#00f5d40a]">
            {secondsRemaining}s
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={complete}
            className="w-full py-3.5 bg-val-cyan hover:bg-teal-200 text-[#06131a] font-bold rounded-xl tracking-wide text-sm flex items-center justify-center gap-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-val-cyan"
          >
            <Play className="w-4 h-4" /> Ready to Resume
          </button>
        </div>
      </div>
    </div>
  );
};
