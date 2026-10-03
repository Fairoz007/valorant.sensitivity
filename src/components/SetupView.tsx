import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { AimingStyle } from '../types';
import { VALORANT_YAW_DEG_PER_COUNT } from '../config/constants';
import { Crosshair, ShieldAlert, Monitor, Mouse, MoveRight, HelpCircle } from 'lucide-react';

export const SetupView: React.FC = () => {
  const { userProfile, setUserProfile, setPhase } = useAppStore();

  const [dpi, setDpi] = useState(userProfile.dpi.toString());
  const [sens, setSens] = useState(userProfile.currentSens.toString());
  const [pollingRate, setPollingRate] = useState(userProfile.pollingRate?.toString() || '1000');
  const [refreshRate, setRefreshRate] = useState(userProfile.refreshRate?.toString() || '144');
  const [mousepadWidth, setMousepadWidth] = useState(userProfile.mousepadWidthCm?.toString() || '45');
  const [aimingStyle, setAimingStyle] = useState<AimingStyle>(userProfile.aimingStyle);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    const numDpi = Number(dpi);
    const numSens = Number(sens);
    const numPolling = Number(pollingRate);
    const numRefresh = Number(refreshRate);
    const numPad = mousepadWidth ? Number(mousepadWidth) : undefined;

    if (!Number.isFinite(numDpi) || !Number.isInteger(numDpi) || numDpi < 100 || numDpi > 64000) {
      newErrors.dpi = 'Please enter a valid DPI between 100 and 64,000.';
    }

    if (!Number.isFinite(numSens) || numSens < 0.01 || numSens > 10.0) {
      newErrors.sens = 'Please enter a valid VALORANT sensitivity (e.g. 0.30).';
    }

    if (numPad !== undefined && (!Number.isFinite(numPad) || numPad <= 0)) {
      newErrors.pad = 'Mousepad width must be a positive number.';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setUserProfile({
      dpi: numDpi,
      currentSens: numSens,
      pollingRate: isNaN(numPolling) ? undefined : numPolling,
      refreshRate: isNaN(numRefresh) ? undefined : numRefresh,
      mousepadWidthCm: numPad,
      aimingStyle,
    });

    setErrors({});
    setPhase('system-check');
  };

  const currentEdpi = Math.round((Number(dpi) || 800) * (Number(sens) || 0.3) * 10) / 10;
  const currentCm360 = Math.round(
    ((360 * 2.54) / ((Number(dpi) || 800) * (Number(sens) || 0.3) * VALORANT_YAW_DEG_PER_COUNT)) * 10
  ) / 10;

  return (
    <div className="lab-page max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12">
      <header className="mb-8 md:mb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <div className="lab-eyebrow flex items-center gap-2 mb-4"><Crosshair className="w-4 h-4" /> PRECISION LAB / PLAYER SETUP</div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white mb-4">Find your<br /><span className="text-val-cyan">competitive edge.</span></h1>
          <p className="text-val-muted text-sm sm:text-base leading-relaxed max-w-xl">A sensitivity built around your motor control. Measure flick accuracy, path efficiency and micro-corrections in a controlled 3D aim environment.</p>
        </div>
        <div className="lab-panel px-5 py-4 lg:max-w-xs border-l-2 border-l-val-cyan">
          <span className="lab-eyebrow">YOUR SESSION</span>
          <p className="text-white text-sm font-semibold mt-2">Configure. Calibrate. Compete.</p>
          <p className="text-val-muted text-xs leading-relaxed mt-2">Start with your current settings. Every measurement stays on your device.</p>
        </div>
      </header>

      {/* Main Form Container */}
      <div className="lab-panel p-5 sm:p-7 md:p-9 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-val-cyan to-transparent opacity-60" />

        <form onSubmit={handleStart} className="space-y-7">
          <div className="flex items-center gap-4 border-b border-val-border pb-5"><div className="w-10 h-10 rounded-xl bg-val-cyan/10 flex items-center justify-center text-val-cyan"><Mouse className="w-5 h-5" /></div><div><span className="lab-eyebrow">01 / CONFIGURATION</span><h2 className="text-xl font-bold text-white mt-1">Player & hardware profile</h2></div></div>
          {errors.pad && <p role="alert" className="text-val-red text-xs">{errors.pad}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* DPI Input */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-200 mb-2">
                <Mouse className="w-4 h-4 text-val-cyan" />
                Mouse DPI / CPI <span className="text-val-red">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  aria-label="Mouse DPI / CPI"
                  value={dpi}
                  onChange={(e) => setDpi(e.target.value)}
                  placeholder="800"
                  className="min-h-12 w-full bg-val-dark/80 border border-val-border rounded-lg px-4 py-2.5 text-white font-mono focus:border-val-cyan focus:outline-none focus:ring-1 focus:ring-val-cyan"
                  required
                />
                <div className="flex gap-1.5 mt-2">
                  {[400, 800, 1600, 3200].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDpi(preset.toString())}
                      className={`text-xs px-2.5 py-1 rounded font-mono transition-colors ${
                        dpi === preset.toString()
                          ? 'bg-val-cyan/20 border border-val-cyan text-val-cyan'
                          : 'bg-val-dark border border-val-border text-val-muted hover:border-gray-500'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              {errors.dpi && <p className="text-val-red text-xs mt-1.5">{errors.dpi}</p>}
            </div>

            {/* Current Sensitivity */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-200 mb-2">
                <Crosshair className="w-4 h-4 text-val-cyan" />
                Current In-Game VALORANT Sensitivity <span className="text-val-red">*</span>
              </label>
              <input
                type="number"
                step="0.001"
                aria-label="Current VALORANT sensitivity"
                  value={sens}
                onChange={(e) => setSens(e.target.value)}
                placeholder="0.30"
                className="min-h-12 w-full bg-val-dark/80 border border-val-border rounded-lg px-4 py-2.5 text-white font-mono focus:border-val-cyan focus:outline-none focus:ring-1 focus:ring-val-cyan"
                required
              />
              <p className="text-xs text-val-muted mt-2">
                The exact decimal sensitivity from your VALORANT settings menu.
              </p>
              {errors.sens && <p className="text-val-red text-xs mt-1.5">{errors.sens}</p>}
            </div>

            {/* Polling Rate */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-200 mb-2">
                Mouse Polling Rate (Hz)
              </label>
              <select
                aria-label="Mouse polling rate"
                  value={pollingRate}
                onChange={(e) => setPollingRate(e.target.value)}
                className="min-h-12 w-full bg-val-dark/80 border border-val-border rounded-lg px-4 py-2.5 text-white font-mono focus:border-val-cyan focus:outline-none"
              >
                <option value="125">125 Hz (8ms)</option>
                <option value="500">500 Hz (2ms)</option>
                <option value="1000">1000 Hz (1ms standard)</option>
                <option value="2000">2000 Hz (0.5ms)</option>
                <option value="4000">4000 Hz (0.25ms)</option>
                <option value="8000">8000 Hz (0.125ms)</option>
              </select>
            </div>

            {/* Monitor Refresh Rate */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-200 mb-2">
                <Monitor className="w-4 h-4 text-val-cyan" />
                Monitor Refresh Rate (Hz)
              </label>
              <select
                aria-label="Monitor refresh rate"
                  value={refreshRate}
                onChange={(e) => setRefreshRate(e.target.value)}
                className="min-h-12 w-full bg-val-dark/80 border border-val-border rounded-lg px-4 py-2.5 text-white font-mono focus:border-val-cyan focus:outline-none"
              >
                <option value="60">60 Hz</option>
                <option value="75">75 Hz</option>
                <option value="120">120 Hz</option>
                <option value="144">144 Hz</option>
                <option value="165">165 Hz</option>
                <option value="240">240 Hz</option>
                <option value="360">360 Hz</option>
                <option value="540">540 Hz</option>
              </select>
            </div>

            {/* Usable Mousepad Width */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-200 mb-2">
                Mousepad Usable Width (cm)
                <span className="text-val-muted font-normal text-xs">(optional)</span>
              </label>
              <input
                type="number"
                step="1"
                aria-label="Mousepad usable width in centimeters"
                  value={mousepadWidth}
                onChange={(e) => setMousepadWidth(e.target.value)}
                placeholder="45"
                className="min-h-12 w-full bg-val-dark/80 border border-val-border rounded-lg px-4 py-2.5 text-white font-mono focus:border-val-cyan focus:outline-none"
              />
              <p className="text-xs text-val-muted mt-2">
                Used to ensure recommended sensitivity fits within your physical swipe area.
              </p>
            </div>

            {/* Aiming Style */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-200 mb-2">
                Dominant Aiming Style
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'arm', label: 'Arm Pivot' },
                  { id: 'wrist', label: 'Wrist Pivot' },
                  { id: 'hybrid', label: 'Hybrid (Arm/Wrist)' },
                  { id: 'unknown', label: "Don't Know" },
                ].map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    aria-pressed={aimingStyle === style.id}
                    onClick={() => setAimingStyle(style.id as AimingStyle)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all text-center ${
                      aimingStyle === style.id
                        ? 'bg-val-cyan/15 border-val-cyan text-val-cyan'
                        : 'bg-val-dark border-val-border text-val-muted hover:border-gray-500'
                    }`}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Current Baseline Preview */}
          <div className="bg-val-cyan/5 border border-val-cyan/20 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs text-val-muted uppercase tracking-wider font-mono">Current Baseline</span>
              <div className="flex items-baseline gap-4 mt-1">
                <div>
                  <span className="text-3xl font-bold font-mono text-white">{currentEdpi}</span>
                  <span className="text-xs text-val-muted ml-1 font-mono">eDPI</span>
                </div>
                <div className="text-val-border">|</div>
                <div>
                  <span className="text-3xl font-bold font-mono text-white">{currentCm360}</span>
                  <span className="text-xs text-val-muted ml-1 font-mono">cm/360</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-val-muted flex items-center gap-1.5 max-w-sm">
              <HelpCircle className="w-4 h-4 text-val-cyan shrink-0" />
              <span>
                Your baseline updates as you configure your profile. The test evaluates sensitivity around your individual motor control.
              </span>
            </div>
          </div>

          {/* Privacy & Protocol Guarantee */}
          <div className="flex items-start gap-3 bg-val-border/20 border border-val-border/40 rounded-lg p-3.5 text-xs text-val-muted">
            <ShieldAlert className="w-4 h-4 text-val-cyan shrink-0 mt-0.5" />
            <p>
              <strong className="text-gray-200">Zero-Tracking Local Science:</strong> No account, no database, no cloud storage.
              All mouse telemetry runs purely in memory on your machine. Pointer lock captures raw hardware deltas without OS curve distortion where supported.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-4 bg-val-cyan hover:bg-val-cyan/80 text-val-dark font-bold rounded-lg uppercase tracking-wider font-mono transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-val-cyan/20"
          >
            Proceed to System Check & Calibration
            <MoveRight className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};
