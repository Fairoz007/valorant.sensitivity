import { describe, it, expect } from 'vitest';
import { SensitivityOptimizer } from '../sensitivity/SensitivityOptimizer';
import type { TrialResult } from '../types';

function createMockTrial(overrides: Partial<TrialResult>): TrialResult {
  return {
    id: 't1',
    candidateId: 'c1',
    candidateSens: 0.3,
    scenario: 'micro',
    targetId: 'tgt1',
    isValid: true,
    targetSpawnTime: 0,
    shotTime: 500,
    reactionLatencyMs: 150,
    movementTimeMs: 350,
    totalAcquisitionTimeMs: 500,
    idealDistanceDeg: 10,
    actualPathDistanceDeg: 12,
    pathEfficiency: 10 / 12,
    firstFlickEndpointDeg: { yaw: 0, pitch: 0 },
    initialFlickErrorDeg: 2,
    isOvershoot: false,
    overshootMagnitudeDeg: 0,
    isUndershoot: false,
    undershootMagnitudeDeg: 0,
    correctionCount: 1,
    endpointErrorDeg: 0.5,
    isHit: true,
    trajectorySummary: [],
    targetPosDeg: { yaw: 10, pitch: 0, radius: 1 },
    startPosDeg: { yaw: 0, pitch: 0 },
    clickPosDeg: { yaw: 9.5, pitch: 0 },
    ...overrides
  };
}

describe('Player Archetypes', () => {
  it('Overshooter shifts sens down', () => {
    const cHigh = SensitivityOptimizer.createCandidate('h', 'H', 0.4, 1.2);
    const cLow = SensitivityOptimizer.createCandidate('l', 'L', 0.2, 0.8);
    
    // High sens has overshoots
    for(let i=0; i<10; i++) {
      cHigh.trials.push(createMockTrial({ isOvershoot: true, totalAcquisitionTimeMs: 400, endpointErrorDeg: 1.0, correctionCount: 2 }));
      cLow.trials.push(createMockTrial({ isOvershoot: false, totalAcquisitionTimeMs: 450, endpointErrorDeg: 0.2, correctionCount: 1 }));
    }
    
    SensitivityOptimizer.computeCandidateScore(cHigh);
    SensitivityOptimizer.computeCandidateScore(cLow);
    
    expect(cHigh.overshootRate).toBe(1);
    expect(cLow.overshootRate).toBe(0);
    expect(cLow.compositeScore).toBeGreaterThan(cHigh.compositeScore);
  });

  it('Undershooter shifts sens up', () => {
    const cHigh = SensitivityOptimizer.createCandidate('h', 'H', 0.4, 1.2);
    const cLow = SensitivityOptimizer.createCandidate('l', 'L', 0.2, 0.8);
    
    for(let i=0; i<10; i++) {
      cLow.trials.push(createMockTrial({ isUndershoot: true, totalAcquisitionTimeMs: 600, endpointErrorDeg: 0.8 }));
      cHigh.trials.push(createMockTrial({ isUndershoot: false, totalAcquisitionTimeMs: 450, endpointErrorDeg: 0.3 }));
    }
    
    SensitivityOptimizer.computeCandidateScore(cHigh);
    SensitivityOptimizer.computeCandidateScore(cLow);
    
    expect(cHigh.compositeScore).toBeGreaterThan(cLow.compositeScore);
  });

  it('Inconsistent has high MAD and lower consistency score', () => {
    const cInc = SensitivityOptimizer.createCandidate('i', 'I', 0.3, 1.0);
    
    for(let i=0; i<10; i++) {
      // Alternate between very fast and very slow to create high variance
      cInc.trials.push(createMockTrial({ totalAcquisitionTimeMs: i % 2 === 0 ? 300 : 700 }));
    }
    
    SensitivityOptimizer.computeCandidateScore(cInc);
    
    // Consistency score should be lower compared to a stable candidate
    const cStable = SensitivityOptimizer.createCandidate('s', 'S', 0.3, 1.0);
    for(let i=0; i<10; i++) {
      cStable.trials.push(createMockTrial({ totalAcquisitionTimeMs: 500 }));
    }
    SensitivityOptimizer.computeCandidateScore(cStable);
    
    expect(cStable.consistencyScore).toBeGreaterThan(cInc.consistencyScore);
  });

  it('Precisionist gets high precision score', () => {
    const cPrec = SensitivityOptimizer.createCandidate('p', 'P', 0.3, 1.0);
    
    for(let i=0; i<10; i++) {
      cPrec.trials.push(createMockTrial({ endpointErrorDeg: 0, isHit: true }));
    }
    
    SensitivityOptimizer.computeCandidateScore(cPrec);
    
    expect(cPrec.precisionScore).toBeCloseTo(100);
    expect(cPrec.hitRate).toBe(1);
  });

  it('Erratic flags low confidence indirectly or low scores', () => {
    const cErr = SensitivityOptimizer.createCandidate('e', 'E', 0.3, 1.0);
    
    for(let i=0; i<10; i++) {
      // High corrections, high error
      cErr.trials.push(createMockTrial({ correctionCount: 4, endpointErrorDeg: 2.0 }));
    }
    
    SensitivityOptimizer.computeCandidateScore(cErr);
    
    // Due to penalties (correctionCount > 2.2), score should be heavily reduced
    expect(cErr.compositeScore).toBeLessThan(50);
  });
});
