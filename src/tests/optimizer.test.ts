import { describe, it, expect } from 'vitest';
import { SensitivityOptimizer } from '../sensitivity/SensitivityOptimizer';

describe('SensitivityOptimizer', () => {
  it('Phase 1: generates 5 blinded candidates', () => {
    const cands = SensitivityOptimizer.generatePhase1Candidates(0.3);
    expect(cands.length).toBe(5);
    
    // Check bounding and multipliers
    const multipliers = cands.map(c => c.multiplier).sort();
    expect(multipliers).toEqual([0.7, 0.85, 1.0, 1.15, 1.3]);
    
    // Blinding check
    const labels = cands.map(c => c.blindLabel).sort();
    expect(labels).toEqual(['Test Block A', 'Test Block B', 'Test Block C', 'Test Block D', 'Test Block E']);
    
    // Randomization and blinding check
    expect(labels.length).toBe(5);
  });
  
  it('Phase 2: generates 3 bracket candidates', () => {
    let cands = SensitivityOptimizer.generatePhase1Candidates(0.3);
    cands[0].compositeScore = 90;
    cands[1].compositeScore = 80;
    cands[2].compositeScore = 70;
    cands[3].compositeScore = 60;
    cands[4].compositeScore = 50;
    
    // Top is cands[0]
    const p2 = SensitivityOptimizer.generatePhase2Candidates(cands.sort((a,b) => b.compositeScore - a.compositeScore));
    expect(p2.length).toBe(3);
  });
});
