# Scientific Aim Testing Methodology & Search Algorithm

**Project:** VALORANT Precision Sensitivity Finder  
**Author:** Lead Aim Experimentation Subagent  
**Date:** 2026-10-02  
**Status:** Canonical Reference  

---

## 1. Experimental Design Philosophy

### 1.1 Within-Subject Comparison
Sensitivity optimization is **strictly within-subject**. We do NOT ask:
> *"Does this player shoot like TenZ or Aspas?"*
We ask:
> *"Across controlled, identical angular target distributions, at which sensitivity does this specific human produce the highest path efficiency, lowest overshoot/undershoot dispersion, cleanest micro-corrections, and most consistent acquisition times?"*

### 1.2 Blinding & Bias Elimination
- **Expectation Bias**: If a player is told "Now testing 0.35 (faster)", they consciously attempt to flick faster or hold the mouse tighter, skewing measurements.
- **Implementation**: The UI labels trials as `Candidate Block A`, `Block B`, etc. The true multiplier is withheld until the final report.

### 1.3 Counterbalancing & Fatigue Mitigation
- **Learning Effect**: Human motor skills improve with repetition. If candidates were tested strictly in ascending order ($S_1 < S_2 < S_3 < S_4 < S_5$), $S_5$ would benefit from muscle warm-up.
- **Counterbalanced Latin Square / Permutation**: Candidate test order is randomized and interleaved.
- **Fatigue Protection**:
  - Rounds are restricted to short 20–30s bursts.
  - Mandatory rest intervals (15–25s) between major blocks.
  - Telemetry monitors rolling baseline performance: if acquisition times degrade globally across all candidates, a rest prompt is issued.

---

## 2. Test Battery Scenarios

| Scenario | Angular Displacement | Target Size | Primary Metric | Sensitivity Signal |
|:---|:---|:---|:---|:---|
| **Test A: Micro Precision** | $1.0^\circ - 4.0^\circ$ | $0.8^\circ$ (small head) | Micro-correction count, endpoint jitter | Too high sens $\to$ jitter, overshoot, inability to stop on head |
| **Test B: Medium Flick** | $8.0^\circ - 20.0^\circ$ | $1.2^\circ$ (standard head) | Initial flick error, overshoot/undershoot | Primary tactical clearing distance |
| **Test C: Large Angle** | $25.0^\circ - 55.0^\circ$ | $1.5^\circ$ | Arm sweep fatigue, undershoot | Too low sens $\to$ runs out of mousepad, massive undershoots |
| **Test D: Target Switching** | Multi-target ($3-5$ items) | $1.2^\circ$ | Inter-target transition time, path efficiency | Multi-engagement stability and rhythm |
| **Test E: Control / Short Track** | Moving $2.5^\circ/\text{s} - 5^\circ/\text{s}$ | $1.4^\circ$ | RMS angular tracking error, smoothness | Tracking stability during counter-strafing |

---

## 3. The 4-Phase Adaptive Search Algorithm

```
Initial S0 (Player's Current VALORANT Sensitivity)
  │
  ▼
[PHASE 1: Coarse Search]
5 Candidates: [0.70x, 0.85x, 1.00x, 1.15x, 1.30x] (Clamped to safe bounds [0.08, 1.50])
Interleaved, blinded testing battery.
Reject bottom 40-60% of candidates using robust scoring.
  │
  ▼
[PHASE 2: Bracketing]
Identify top candidate S_top and its strongest adjacent neighbor.
Interpolate 3 midpoints within the high-performing basin.
  │
  ▼
[PHASE 3: Fine Search]
Test refined candidates with narrow intervals (±3% to ±5%).
Determine provisional optimal sensitivity S*.
  │
  ▼
[PHASE 4: Confirmation Battery]
Tri-point confirmation: [0.95*S*, S*, 1.05*S*].
Fresh target seed. Validate stability.
Final Output: Recommended Sensitivity + Recommended Range (e.g. [0.278 - 0.294]).
```

---

## 4. Confidence Score Calculation

Confidence is evaluated as an evidence-based index $[0, 100\%]$ mapped to **High**, **Moderate**, or **Low**:
1. **Sample Size & Valid Trials ($\mathbf{w_1 = 0.25}$)**: Ratio of completed valid trials vs required statistical minimum ($N \ge 35$).
2. **Statistical Separation ($\mathbf{w_2 = 0.30}$)**: Score separation between the winner and the next runner-up relative to intra-candidate MAD variance.
3. **Confirmation Consistency ($\mathbf{w_3 = 0.25}$)**: Did the confirmation stage validate the winner over its $\pm 5\%$ neighbors?
4. **Environment Integrity ($\mathbf{w_4 = 0.20}$)**: `isRawInputActive` present, no dropped frames/lock drops, low frame-time jitter.
