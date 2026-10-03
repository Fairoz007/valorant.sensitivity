import React from 'react';
import { useAppStore } from './store/useAppStore';
import { SetupView } from './components/SetupView';
import { SystemCheckView } from './components/SystemCheckView';
import { CalibrationView } from './components/CalibrationView';
import { ArenaView } from './components/ArenaView';
import { ResultsView } from './components/ResultsView';
import { Crosshair, ShieldCheck, Cpu } from 'lucide-react';
import { VALORANT_YAW_DEG_PER_COUNT } from './config/constants';

export const App: React.FC = () => {
  const { phase, isRawInputActive } = useAppStore();

  const isArenaActive =
    phase === 'warmup' ||
    phase === 'coarse' ||
    phase === 'bracketing' ||
    phase === 'fine' ||
    phase === 'confirmation' ||
    phase === 'rest';

  const steps = [
    { id: 'setup', label: '1. Setup' },
    { id: 'system-check', label: '2. Diagnostics' },
    { id: 'calibration', label: '3. Calibration' },
    { id: 'arena', label: '4. Aim Battery' },
    { id: 'results', label: '5. Results' },
  ];

  const getCurrentStepIndex = () => {
    switch (phase) {
      case 'setup':
        return 0;
      case 'system-check':
        return 1;
      case 'calibration':
        return 2;
      case 'warmup':
      case 'coarse':
      case 'bracketing':
      case 'fine':
      case 'confirmation':
      case 'rest':
        return 3;
      case 'results':
        return 4;
      default:
        return 0;
    }
  };

  const currentStepIdx = getCurrentStepIndex();

  return (
    <div className="min-h-screen bg-val-black text-white flex flex-col font-sans selection:bg-val-cyan selection:text-black">
      {/* Top Navbar */}
      <header className="border-b border-val-border/60 bg-val-dark/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-val-red flex items-center justify-center text-white shadow-md shadow-val-red/30">
              <Crosshair className="w-5 h-5" />
            </div>
            <div>
              <span className="font-mono font-bold tracking-tight text-white text-sm uppercase">
                VALORANT SENS FINDER
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-mono px-2 py-0.5 rounded bg-val-cyan/15 text-val-cyan border border-val-cyan/30">
                v2.0 LAB
              </span>
            </div>
          </div>

          {/* Stepper Progress */}
          <div className="hidden md:flex items-center gap-1.5 font-mono text-xs">
            {steps.map((s, idx) => (
              <React.Fragment key={s.id}>
                <span
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    idx === currentStepIdx
                      ? 'bg-val-cyan/20 border border-val-cyan text-val-cyan font-bold'
                      : idx < currentStepIdx
                      ? 'text-gray-400'
                      : 'text-gray-600'
                  }`}
                >
                  {s.label}
                </span>
                {idx < steps.length - 1 && <span className="text-gray-600">/</span>}
              </React.Fragment>
            ))}
          </div>

          {/* Hardware & Privacy Badge */}
          <div className="flex items-center gap-3 text-xs font-mono text-val-muted">
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-gray-400 bg-val-dark border border-val-border px-2.5 py-1 rounded-md">
              <ShieldCheck className="w-3.5 h-3.5 text-val-cyan" />
              <span>Local Session Only</span>
            </div>
            {isArenaActive && (
              <div className="flex items-center gap-1.5 text-[11px] text-val-cyan bg-val-cyan/10 border border-val-cyan/30 px-2.5 py-1 rounded-md">
                <Cpu className="w-3.5 h-3.5" />
                <span>{isRawInputActive ? 'Raw Input' : 'Standard'}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 flex flex-col justify-center">
        {phase === 'setup' && <SetupView />}
        {phase === 'system-check' && <SystemCheckView />}
        {phase === 'calibration' && <CalibrationView />}

        {/* 3D FPS Shooting Arena */}
        {isArenaActive && (
          <div className="flex-1 w-full h-full relative">
            <ArenaView />

          </div>
        )}

        {phase === 'results' && <ResultsView />}
      </main>

      {/* Persistent Footer */}
      {!isArenaActive && (
        <footer className="border-t border-val-border/40 py-6 text-center text-xs text-val-muted font-mono">
          <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p>
              VALORANT Precision Sensitivity Finder · Local scientific aim telemetry.
            </p>
            <p className="text-[11px]">
              Engine yaw constant: <code className="text-val-cyan">{VALORANT_YAW_DEG_PER_COUNT}°/count</code>
            </p>
          </div>
        </footer>
      )}
    </div>
  );
};

export default App;
