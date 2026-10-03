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
    <div className="lab-page max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12">
      <header className="mb-8 max-w-3xl">
        <div className="lab-eyebrow mb-4">PRECISION LAB / DIAGNOSTICS</div>
        <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-4">
          Know your environment.
        </h2>
        <p className="text-val-muted text-sm">
          Verifying browser input APIs, raw mouse capture capabilities, and display timing integrity.
        </p>
      </header>

      <div className="lab-panel p-5 sm:p-8 space-y-6">
        {checking ? (
          <div role="status" className="py-20 text-center">
            <div className="w-10 h-10 border-4 border-val-cyan border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-mono text-gray-300">Measuring display frame timing & checking Pointer Lock API...</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap justify-between gap-3 items-center border-b border-val-border pb-5"><div><span className="lab-eyebrow">02 / SYSTEM INTEGRITY</span><h3 className="text-xl text-white font-bold mt-1">Hardware readiness</h3></div><span className="text-xs text-val-cyan font-mono border border-val-cyan/25 rounded-full px-3 py-1.5">CHECK COMPLETE</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><div className="bg-val-cyan/5 border border-val-cyan/20 rounded-xl p-5"><p className="lab-eyebrow">DISPLAY TIMING</p><p className="text-3xl text-white font-mono font-bold mt-3">{report.estimatedRefreshRateHz > 0 ? report.estimatedRefreshRateHz : '—'} <span className="text-sm text-val-muted">Hz</span></p></div><div className="bg-val-dark/60 border border-val-border rounded-xl p-5"><p className="lab-eyebrow">VIEWPORT</p><p className="text-2xl text-white font-mono font-bold mt-3">{report.viewportWidth} <span className="text-val-muted">×</span> {report.viewportHeight}</p></div><div className="bg-val-dark/60 border border-val-border rounded-xl p-5"><p className="lab-eyebrow">PIXEL DENSITY</p><p className="text-3xl text-white font-mono font-bold mt-3">{report.devicePixelRatio}<span className="text-sm text-val-muted ml-2">DPR</span></p></div></div>
            {/* Grid of Diagnostics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pointer Lock */}
              <div className="bg-val-dark/70 p-5 sm:p-6 rounded-xl border border-val-border flex items-start gap-4">
                <ShieldCheck className={`w-5 h-5 shrink-0 mt-0.5 ${report.pointerLockSupported ? 'text-val-cyan' : 'text-val-red'}`} />
                <div>
                  <h4 className="text-sm font-semibold text-white">Pointer Lock API</h4>
                  <p className="text-xs text-val-muted mt-0.5">
                    {report.pointerLockSupported ? 'Supported and available for 3D cursor capture' : 'Not supported by this browser'}
                  </p>
                </div>
              </div>

              {/* Raw Input / unadjustedMovement */}
              <div className="bg-val-dark/70 p-5 sm:p-6 rounded-xl border border-val-border flex items-start gap-4">
                <Cpu className="w-5 h-5 text-val-cyan shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-white">Unadjusted Movement (Raw Input)</h4>
                  <p className="text-xs text-val-muted mt-0.5">
                    Unadjusted movement will be requested when you capture the mouse. Availability is verified by that request.
                  </p>
                </div>
              </div>

              {/* Display Refresh */}
              <div className="bg-val-dark/70 p-5 sm:p-6 rounded-xl border border-val-border flex items-start gap-4">
                <CheckCircle2 className="w-5 h-5 text-val-cyan shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-white">Estimated Display Refresh</h4>
                  <p className="text-xs text-val-muted mt-0.5">
                    {report.estimatedRefreshRateHz > 0 ? `${report.estimatedRefreshRateHz} Hz measured via animation frames` : 'Not measured'}
                  </p>
                </div>
              </div>

              {/* Browser Zoom */}
              <div className="bg-val-dark/70 p-5 sm:p-6 rounded-xl border border-val-border flex items-start gap-4">
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
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pt-4 border-t border-val-border">
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
                className="px-6 py-2.5 bg-val-cyan hover:bg-val-cyan/80 text-val-dark disabled:opacity-40 disabled:cursor-not-allowed font-bold rounded-lg uppercase tracking-wider font-mono text-sm flex items-center gap-2 transition-all"
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
