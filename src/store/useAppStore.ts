import { create } from 'zustand';
import type {
  UserSetupProfile,
  TestPhase,
  CandidateSensitivity,
  TrialResult,
  FinalRecommendation,
} from '../types';
import type { SystemCheckReport, CalibrationStep, CalibrationMotionStats } from '../calibration/CalibrationManager';
import { DEFAULT_DPI, DEFAULT_SENS } from '../config/constants';

function hasOnlyFiniteNumbers(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(hasOnlyFiniteNumbers);
  if (value !== null && typeof value === 'object') return Object.values(value).every(hasOnlyFiniteNumbers);
  return true;
}

interface AppState {
  // Setup Profile
  userProfile: UserSetupProfile;
  setUserProfile: (profile: Partial<UserSetupProfile>) => void;

  // Lifecycle
  phase: TestPhase;
  setPhase: (phase: TestPhase) => void;

  // System Check & Calibration
  systemReport: SystemCheckReport | null;
  setSystemReport: (report: SystemCheckReport | null) => void;
  calibrationStep: CalibrationStep;
  setCalibrationStep: (step: CalibrationStep) => void;
  calibrationStats: CalibrationMotionStats;
  setCalibrationStats: (stats: CalibrationMotionStats) => void;
  calibrationClicks: number;
  setCalibrationClicks: (clicks: number) => void;

  // Arena HUD State (Decoupled from high-frequency mouse loop)
  activeCandidate: CandidateSensitivity | null;
  setActiveCandidate: (cand: CandidateSensitivity | null) => void;
  activeCandidateIndex: number;
  totalCandidates: number;
  setCandidateProgress: (index: number, total: number) => void;
  
  roundIndex: number;
  totalRounds: number;
  targetsRemaining: number;
  hitsCount: number;
  missesCount: number;
  elapsedRoundTimeSec: number;
  updateHud: (targetsRemaining: number, hits: number, misses: number, elapsedSec?: number) => void;

  // Fatigue & Rest
  isFatigued: boolean;
  setFatigued: (fatigued: boolean) => void;
  restSecondsRemaining: number;
  setRestSecondsRemaining: (sec: number) => void;

  // Raw Input Badge
  isPointerLocked: boolean;
  setPointerLocked: (locked: boolean) => void;
  isRawInputActive: boolean;
  setRawInputActive: (active: boolean) => void;

  // Completed Trials & Final Recommendation
  allTrialResults: TrialResult[];
  addTrialResult: (trial: TrialResult) => void;
  finalRecommendation: FinalRecommendation | null;
  setFinalRecommendation: (rec: FinalRecommendation | null) => void;

  resultStatus: 'idle' | 'loading' | 'valid' | 'insufficient-data' | 'error';
  resultError: string | null;
  beginResultCalculation: () => void;
  completeSession: (rec: FinalRecommendation) => void;
  failSession: (reason: string, status?: 'insufficient-data' | 'error') => void;

  // Reset
  resetSession: () => void;
}

const initialProfile: UserSetupProfile = {
  dpi: DEFAULT_DPI,
  currentSens: DEFAULT_SENS,
  pollingRate: 1000,
  refreshRate: 144,
  screenResolution: {
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  },
  mousepadWidthCm: 45,
  aimingStyle: 'hybrid',
};

export const useAppStore = create<AppState>((set) => ({
  userProfile: initialProfile,
  setUserProfile: (profile) =>
    set((state) => ({ userProfile: { ...state.userProfile, ...profile } })),

  phase: 'setup',
  setPhase: (phase) => set({ phase }),

  systemReport: null,
  setSystemReport: (report) => set({ systemReport: report }),
  calibrationStep: 'idle',
  setCalibrationStep: (calibrationStep) => set({ calibrationStep }),
  calibrationStats: {
    horizontalSwipes: 0,
    verticalSwipes: 0,
    horizontalAccumulator: 0,
    verticalAccumulator: 0,
    currentHorizontalDir: 'NONE',
    currentVerticalDir: 'NONE',
    stallsDetected: 0,
    lastDx: 0,
    lastDy: 0,
    totalDistanceX: 0,
    totalDistanceY: 0,
  },
  setCalibrationStats: (calibrationStats) => set({ calibrationStats }),
  calibrationClicks: 0,
  setCalibrationClicks: (calibrationClicks) => set({ calibrationClicks }),

  activeCandidate: null,
  setActiveCandidate: (activeCandidate) => set({ activeCandidate }),
  activeCandidateIndex: 0,
  totalCandidates: 1,
  setCandidateProgress: (activeCandidateIndex, totalCandidates) =>
    set({ activeCandidateIndex, totalCandidates }),

  roundIndex: 1,
  totalRounds: 5,
  targetsRemaining: 0,
  hitsCount: 0,
  missesCount: 0,
  elapsedRoundTimeSec: 0,
  updateHud: (targetsRemaining, hitsCount, missesCount, elapsedRoundTimeSec) =>
    set((state) => ({
      targetsRemaining,
      hitsCount,
      missesCount,
      elapsedRoundTimeSec:
        elapsedRoundTimeSec !== undefined ? elapsedRoundTimeSec : state.elapsedRoundTimeSec,
    })),

  isFatigued: false,
  setFatigued: (isFatigued) => set({ isFatigued }),
  restSecondsRemaining: 20,
  setRestSecondsRemaining: (restSecondsRemaining) => set({ restSecondsRemaining }),

  isPointerLocked: false,
  setPointerLocked: (isPointerLocked) => set({ isPointerLocked }),
  isRawInputActive: false,
  setRawInputActive: (isRawInputActive) => set({ isRawInputActive }),

  allTrialResults: [],
  addTrialResult: (trial) =>
    set((state) => ({ allTrialResults: [...state.allTrialResults, trial] })),
  finalRecommendation: null,
  setFinalRecommendation: (finalRecommendation) => set({ finalRecommendation, resultStatus: finalRecommendation ? 'valid' : 'idle', resultError: null }),
  resultStatus: 'idle',
  resultError: null,
  beginResultCalculation: () => set({ resultStatus: 'loading', resultError: null }),
  completeSession: (finalRecommendation) => {
    const values = [finalRecommendation.recommendedSens, ...finalRecommendation.recommendedRange,
      finalRecommendation.dpi, finalRecommendation.edpi, finalRecommendation.cm360,
      finalRecommendation.currentSens, finalRecommendation.currentEdpi, finalRecommendation.currentCm360,
      finalRecommendation.percentageChange, finalRecommendation.confidenceScore,
      ...Object.values(finalRecommendation.telemetrySummary).filter(v => typeof v === 'number')];
    if (!values.every(Number.isFinite) || !hasOnlyFiniteNumbers(finalRecommendation) ||
      finalRecommendation.dpi <= 0 || finalRecommendation.currentSens <= 0 || finalRecommendation.recommendedSens <= 0 ||
      finalRecommendation.recommendedRange[0] > finalRecommendation.recommendedSens ||
      finalRecommendation.recommendedRange[1] < finalRecommendation.recommendedSens) {
      set({ phase: 'results', finalRecommendation: null, resultStatus: 'error', resultError: 'The calculated recommendation contained invalid values. Please retest.' });
      return;
    }
    set({ finalRecommendation, resultStatus: 'valid', resultError: null, phase: 'results', isFatigued: false });
  },
  failSession: (resultError, resultStatus = 'insufficient-data') =>
    set({ finalRecommendation: null, resultError, resultStatus, phase: 'results', isFatigued: false }),

  resetSession: () =>
    set({
      phase: 'setup',
      systemReport: null,
      calibrationStep: 'idle',
      calibrationStats: { horizontalSwipes: 0, verticalSwipes: 0, horizontalAccumulator: 0, verticalAccumulator: 0, currentHorizontalDir: 'NONE', currentVerticalDir: 'NONE', stallsDetected: 0, lastDx: 0, lastDy: 0, totalDistanceX: 0, totalDistanceY: 0 },
      calibrationClicks: 0,
      activeCandidate: null,
      activeCandidateIndex: 0,
      roundIndex: 1,
      totalCandidates: 1,
      totalRounds: 5,
      targetsRemaining: 0,
      elapsedRoundTimeSec: 0,
      restSecondsRemaining: 20,
      isPointerLocked: false,
      isRawInputActive: false,
      resultStatus: 'idle',
      resultError: null,
      hitsCount: 0,
      missesCount: 0,
      allTrialResults: [],
      finalRecommendation: null,
      isFatigued: false,
    }),
}));
