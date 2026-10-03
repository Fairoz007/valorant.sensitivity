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
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header Banner */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-val-red/10 border border-val-red/30 text-val-red text-xs font-mono tracking-widest uppercase mb-4">
          <Crosshair className="w-3.5 h-3.5" /> Scientific Aim Testing Lab
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white uppercase font-sans mb-3">
          VALORANT Precision Sensitivity Finder
        </h1>
        <p className="text-val-muted text-base max-w-2xl mx-auto">
          Calibrate your personal motor control through controlled 3D angular target acquisition.
          Measures path efficiency, ballistic flick errors, overshoots, and micro-corrections to discover your
          statistically optimal sensitivity.
        </p>
      </div>

      {/* Main Form Container */}
      <div className="bg-val-card border border-val-border rounded-xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-val-red via-val-cyan to-val-red opacity-80" />

        <form onSubmit={handleStart} className="space-y-6">
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
                  value={dpi}
                  onChange={(e) => setDpi(e.target.value)}
                  placeholder="800"
                  className="w-full bg-val-dark border border-val-border rounded-lg px-4 py-2.5 text-white font-mono focus:border-val-cyan focus:outline-none focus:ring-1 focus:ring-val-cyan"
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
                <Crosshair className="w-4 h-4 text-val-red" />
                Current In-Game VALORANT Sensitivity <span className="text-val-red">*</span>
              </label>
              <input
                type="number"
                step="0.001"
                value={sens}
                onChange={(e) => setSens(e.target.value)}
                placeholder="0.30"
                className="w-full bg-val-dark border border-val-border rounded-lg px-4 py-2.5 text-white font-mono focus:border-val-red focus:outline-none focus:ring-1 focus:ring-val-red"
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
                value={pollingRate}
                onChange={(e) => setPollingRate(e.target.value)}
                className="w-full bg-val-dark border border-val-border rounded-lg px-4 py-2.5 text-white font-mono focus:border-val-cyan focus:outline-none"
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
                value={refreshRate}
                onChange={(e) => setRefreshRate(e.target.value)}
                className="w-full bg-val-dark border border-val-border rounded-lg px-4 py-2.5 text-white font-mono focus:border-val-cyan focus:outline-none"
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
                value={mousepadWidth}
                onChange={(e) => setMousepadWidth(e.target.value)}
                placeholder="45"
                className="w-full bg-val-dark border border-val-border rounded-lg px-4 py-2.5 text-white font-mono focus:border-val-cyan focus:outline-none"
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
          <div className="bg-val-dark/70 border border-val-border/60 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs text-val-muted uppercase tracking-wider font-mono">Current Baseline</span>
              <div className="flex items-baseline gap-4 mt-1">
                <div>
                  <span className="text-xl font-bold font-mono text-white">{currentEdpi}</span>
                  <span className="text-xs text-val-muted ml-1 font-mono">eDPI</span>
                </div>
                <div className="text-val-border">|</div>
                <div>
                  <span className="text-xl font-bold font-mono text-white">{currentCm360}</span>
                  <span className="text-xs text-val-muted ml-1 font-mono">cm/360</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-val-muted flex items-center gap-1.5 max-w-sm">
              <HelpCircle className="w-4 h-4 text-val-cyan shrink-0" />
              <span>
                Standard VCT pro median is ~250 eDPI (52 cm/360). Your personal test will optimize around your individual motor control.
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
            className="w-full py-4 bg-val-red hover:bg-val-darkRed text-white font-bold rounded-lg uppercase tracking-wider font-mono transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-val-red/20"
          >
            Proceed to System Check & Calibration
            <MoveRight className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};
