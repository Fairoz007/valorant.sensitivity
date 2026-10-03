# Real-Human Sensitivity Validation Protocol

**Project:** VALORANT Precision Sensitivity Finder  
**Author:** Subagent 8 — Human Experimentation Lead  
**Date:** 2026-10-02  
**Status:** Protocol Specification  

---

## 1. Objective & Non-Automated Nature

Automated simulations prove that the mathematical optimization engine converges given ideal synthetic biomechanical curves. However, human motor control introduces:
- Day-to-day muscle fatigue
- Temperature & friction variations on mousepad weaves
- Cognitive attention fluctuations
- Grip shifts (e.g. fingertip to claw under pressure)

This protocol specifies the rigorous empirical procedure required before any final build can be certified as **EXPERIMENTALLY VALIDATED**.

---

## 2. Participant Profile & Hardware Ledger

For each human participant, document:
- **Participant ID**: Anonymous hash (e.g. `P-042`)
- **Hardware Configuration**:
  - Mouse Sensor / Model (e.g., Razer DeathAdder V3 Pro / Focus Pro 30K)
  - Hardware DPI / CPI (400, 800, 1600, 3200)
  - Polling Rate (1000 Hz, 4000 Hz, 8000 Hz)
  - Mousepad Surface (Cloth speed, cloth control, glass, Cordura)
  - Monitor Refresh Rate (144 Hz, 240 Hz, 360 Hz)
  - Native Resolution (1920x1080, 2560x1440)
  - Browser & OS (e.g. Chrome 134 on Windows 11 23H2)
  - Raw Input Status (`unadjustedMovement: true` verified)
  - Dominant Aiming Style (Arm, Wrist, Hybrid)

---

## 3. Multi-Session Repeatability Trial Procedure

1. **Trial Repetitions**:
   Each participant must complete **three independent test sessions** on different days (or separated by at least 4 hours to eliminate immediate neuromuscular learning memory).
2. **Standardization**:
   - 5-minute casual in-game deathmatch or aim warmup prior to starting the session.
   - Identical physical desk seating height and mousepad position.
   - Do not alter DPI, Windows pointer speed, or mouse skates between sessions.
3. **Session Output Logging**:
   Record the exported JSON result file for each session:
   - Session 1: $S_1$, Range $[S_{1,\text{low}}, S_{1,\text{high}}]$, Confidence
   - Session 2: $S_2$, Range $[S_{2,\text{low}}, S_{2,\text{high}}]$, Confidence
   - Session 3: $S_3$, Range $[S_{3,\text{low}}, S_{3,\text{high}}]$, Confidence

---

## 4. Statistical Repeatability Metrics

For participant recommendations $\{S_1, S_2, S_3\}$:

1. **Mean & Median Recommendation**:
   $$\mu_S = \frac{1}{3}\sum_{i=1}^3 S_i, \quad \tilde{S} = \text{median}(S_1, S_2, S_3)$$
2. **Sample Standard Deviation ($\sigma_S$)**:
   $$\sigma_S = \sqrt{\frac{1}{2}\sum_{i=1}^3 (S_i - \mu_S)^2}$$
3. **Coefficient of Variation ($CV$)**:
   $$CV = \frac{\sigma_S}{\mu_S} \times 100\%$$
   - **Target Benchmark**: $CV \le 3.5\%$ indicates high repeatability.
   - $CV > 6.0\%$ flags excessive inter-session variability.
4. **Recommended Range Overlap**:
   Verify whether the intersection of the recommended ranges is non-empty:
   $$\bigcap_{i=1}^3 [S_{i,\text{low}}, S_{i,\text{high}}] \neq \emptyset$$
   A consistent measurement produces mutually overlapping confidence bounds.

---

## 5. Certification Tier Criteria

- **ENGINEERING-VALIDATED**: Automated tests, Three.js raycasting, 10,000-session Monte Carlo simulations, and deterministic ground-truth telemetry pass 100%. (Current Status)
- **HUMAN-VALIDATION-PENDING**: Experimental human protocol published; tester recruitment active.
- **EXPERIMENTALLY VALIDATED**: At least 30 independent human testers complete the 3-session protocol with mean $CV \le 3.5\%$ and range overlap $\ge 90\%$.
