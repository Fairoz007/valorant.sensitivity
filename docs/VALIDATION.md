# Statistical Validation & Telemetry Verification Framework

**Project:** VALORANT Precision Sensitivity Finder  
**Author:** Lead QA & Validation Subagent  
**Date:** 2026-10-02  
**Status:** Canonical Reference  

---

## 1. Simulation Testing Archetypes

To verify that the scoring and recommendation algorithms behave rationally across diverse human motor patterns, synthetic telemetry generators evaluate seven archetypes:

1. **Player A (The Over-Flicker / High-Sens Jitterer)**:
   - Behavior: High initial velocity, systematic overshoot $>30\%$, excessive micro-corrections ($>3$ per trial).
   - Expected Output: Scoring severely penalizes high sensitivity; algorithm shifts recommended sensitivity downward towards lower candidates.
2. **Player B (The Under-Flicker / Low-Sens Struggler)**:
   - Behavior: Smooth paths, zero overshoots, but large undershoots requiring multiple drag-lifts on medium/large flicks; high movement time.
   - Expected Output: Penalizes excessively low candidates; recommends higher sensitivity with adequate physical turn capacity.
3. **Player C (The Sluggish Precisionist)**:
   - Behavior: Very accurate, almost 0 error, but very slow reaction and movement times.
   - Expected Output: Balances precision score with movement efficiency; avoids overly sluggish extremes.
4. **Player D (The Erratic / Inconsistent Player)**:
   - Behavior: High variance across trials at same sensitivity; erratic paths, low efficiency.
   - Expected Output: Confidence model reports **Low Confidence** or **Moderate Confidence** with a wider recommended range.
5. **Player E (The Balanced Tactician)**:
   - Behavior: High initial flick accuracy ($10-15^\circ$ on target), minimal corrections ($0.8 - 1.2$), path efficiency $>92\%$.
   - Expected Output: Sharp convergence to optimal sensitivity with **High Confidence** score.
6. **Player F (Arm Aiming / Micro-Correction Weakness)**:
   - Behavior: Great large flicks, poor micro-adjustments.
7. **Player G (Fast Micro / Unstable Tracking)**:
   - Behavior: High jitter on tracking, crisp clicks on static targets.

---

## 2. Mathematical Verification Tests

Unit tests verify:
- Conversion of DPI and VALORANT sensitivity to eDPI.
- Conversion to cm/360 using $\kappa = 0.06996$.
- Angular coordinate transforms to 3D Cartesian coordinates.
- Primary axis projection, overshoot, and undershoot calculations.
- Seeded pseudo-random generator repeatability (identical seeds produce identical target angles).
- Outlier filtering (exclusion of trials with pointer lock loss or negative latency).
