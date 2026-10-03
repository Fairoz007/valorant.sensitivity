import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { calibrationManager } from '../calibration/CalibrationManager';
import type { SystemCheckReport } from '../calibration/CalibrationManager';
import { CheckCircle2, AlertTriangle, ShieldCheck, Cpu, ArrowRight, ArrowLeft } from 'lucide-react';

export const SystemCheckView: React.FC = () => {
  const { setPhase, systemReport, setSystemReport } = useAppStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setChecking(true);
      const report = await calibrationManager.performSystemCheck();
      if (isMounted) {
        setSystemReport(report);
        setChecking(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [setSystemReport]);

  const report: SystemCheckReport = systemReport || {
    pointerLockSupported: true,
    rawInputSupported: true,
    rawInputActive: false,
    estimatedPollingRateHz: 1000,
    estimatedRefreshRateHz: 144,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    browserZoom: 100,
    isZoomStandard: true,
    warnings: [],
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-black uppercase tracking-tight text-white mb-2">
          Environment & Hardware Diagnostics
        </h2>
        <p className="text-val-muted text-sm">
          Verifying browser input APIs, raw mouse capture capabilities, and display timing integrity.
        </p>
      </div>

      <div className="bg-val-card border border-val-border rounded-xl p-6 md:p-8 shadow-2xl space-y-6">
        {checking ? (
          <div className="py-16 text-center">
            <div className="w-10 h-10 border-4 border-val-cyan border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-mono text-gray-300">Measuring display frame timing & checking Pointer Lock API...</p>
          </div>
        ) : (
          <>
            {/* Grid of Diagnostics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pointer Lock */}
              <div className="bg-val-dark p-4 rounded-lg border border-val-border flex items-start gap-3">
                <ShieldCheck className={`w-5 h-5 shrink-0 mt-0.5 ${report.pointerLockSupported ? 'text-val-cyan' : 'text-val-red'}`} />
                <div>
                  <h4 className="text-sm font-semibold text-white">Pointer Lock API</h4>
                  <p className="text-xs text-val-muted mt-0.5">
                    {report.pointerLockSupported ? 'Supported and available for 3D cursor capture' : 'Not supported by this browser'}
                  </p>
                </div>
              </div>

              {/* Raw Input / unadjustedMovement */}
              <div className="bg-val-dark p-4 rounded-lg border border-val-border flex items-start gap-3">
                <Cpu className="w-5 h-5 text-val-cyan shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-white">Unadjusted Movement (Raw Input)</h4>
                  <p className="text-xs text-val-muted mt-0.5">
                    Unadjusted movement will be requested when you capture the mouse. Availability is verified by that request.
                  </p>
                </div>
              </div>

              {/* Display Refresh */}
              <div className="bg-val-dark p-4 rounded-lg border border-val-border flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-val-cyan shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-white">Estimated Display Refresh</h4>
                  <p className="text-xs text-val-muted mt-0.5">
                    {report.estimatedRefreshRateHz > 0 ? `${report.estimatedRefreshRateHz} Hz measured via animation frames` : 'Not measured'}
                  </p>
                </div>
              </div>

              {/* Browser Zoom */}
              <div className="bg-val-dark p-4 rounded-lg border border-val-border flex items-start gap-3">
                {report.isZoomStandard ? (
                  <CheckCircle2 className="w-5 h-5 text-val-cyan shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="text-sm font-semibold text-white">Browser Zoom Level</h4>
                  <p className="text-xs text-val-muted mt-0.5">
                    {report.browserZoom > 0 ? `${report.browserZoom}%` : 'Cannot reliably detect desktop browser zoom. Use 100% (Ctrl+0).'}
                  </p>
                </div>
              </div>
            </div>

            {/* Warnings if any */}
            {report.warnings.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4" /> Recommended Adjustments
                </div>
                {report.warnings.map((w, idx) => (
                  <p key={idx} className="text-xs text-gray-300">
                    • {w}
                  </p>
                ))}
              </div>
            )}

            {/* Scientific Principle Notice */}
            <div className="p-4 bg-val-dark/60 rounded-lg border border-val-border/40 text-xs text-val-muted">
              <strong className="text-gray-200">How Pointer Lock Works:</strong> When you start the test, clicking the arena requests
              Pointer Lock with unadjusted movement. Your OS cursor will disappear and raw movement counts directly rotate the virtual camera,
              mirroring VALORANT. You can press <kbd className="px-1.5 py-0.5 bg-val-card border border-val-border rounded text-val-cyan font-mono">ESC</kbd> at any time to exit pointer lock.
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-val-border">
              <button
                type="button"
                onClick={() => setPhase('setup')}
                className="px-5 py-2.5 rounded-lg border border-val-border text-val-muted hover:text-white font-mono text-sm flex items-center gap-2 hover:bg-val-dark"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>

              <button
                type="button"
                disabled={!report.pointerLockSupported}
                onClick={() => setPhase('calibration')}
                className="px-6 py-2.5 bg-val-red hover:bg-val-darkRed text-white font-bold rounded-lg uppercase tracking-wider font-mono text-sm flex items-center gap-2 transition-all"
              >
                Continue to Motion Calibration <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
