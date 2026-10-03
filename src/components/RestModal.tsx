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
    <div className="fixed inset-0 z-50 bg-val-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-val-card border border-val-border rounded-2xl p-8 max-w-md w-full text-center shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-val-cyan to-val-red" />

        <div className="w-16 h-16 rounded-full bg-val-cyan/15 border-2 border-val-cyan flex items-center justify-center mx-auto text-val-cyan mb-4 animate-bounce">
          <Coffee className="w-8 h-8" />
        </div>

        <h3 className="text-2xl font-black uppercase tracking-tight text-white mb-2">
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
          <p className="text-val-muted text-sm mb-6">
            Relax your wrist and forearm. Scientific aim testing requires consistent neuromuscular freshness to isolate sensitivity.
          </p>
        )}

        {/* Countdown Ring / Display */}
        <div className="my-6">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full border-4 border-val-cyan/30 text-3xl font-black font-mono text-val-cyan">
            {secondsRemaining}s
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={complete}
            className="w-full py-3 bg-val-red hover:bg-val-darkRed text-white font-bold rounded-lg uppercase tracking-wider font-mono text-sm flex items-center justify-center gap-2 transition-all"
          >
            <Play className="w-4 h-4" /> Ready to Resume
          </button>
        </div>
      </div>
    </div>
  );
};
