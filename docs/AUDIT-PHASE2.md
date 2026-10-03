# Code Audit & Invariant Verification (Phase 2)

**Project:** VALORANT Precision Sensitivity Finder  
**Author:** Subagent 1 — Code Auditor  
**Date:** 2026-10-02  
**Status:** Audit Completed & Invariants Verified  

---

## 1. Executive Summary

This independent code audit inspected the complete codebase for:
- Unit mismatches (radians vs degrees, counts vs pixels)
- Frame-rate dependencies in physics/movement
- React state leaking into high-frequency input handlers
- Timestamp precision and velocity estimation
- Memory leaks and buffer management
- Double sensitivity or DPI application
- Candidate blinding leakage

---

## 2. Detailed Findings & Remediations

### 2.1 Calibration Swipe Detection Failure (CRITICAL - FIXED)
- **Vulnerability Identified**: The original swipe detection condition in `CalibrationManager.ts` required:
  ```typescript
  if ((this.lastDx > 10 && dx < -10) || (this.lastDx < -10 && dx > 10))
  ```
  At 1000 Hz polling rate, consecutive raw mouse counts rarely jump instantaneously from $+10$ to $-10$ in a single 1ms frame. Natural human hand reversals decelerate smoothly through zero ($+5, +3, +1, 0, -1, -3$). As a consequence, `swipes` never incremented from $0/4$.
- **Remediation**: Implemented an accumulated directional displacement state machine with `HORIZONTAL_THRESHOLD = 50` and `VERTICAL_THRESHOLD = 40`. Micro-jitter is rejected, and directional reversals reliably trigger. Verified with automated tests in `src/tests/calibration.test.ts`.

### 2.2 Ballistic Flick Deceleration Trough Detection (HIGH - FIXED)
- **Vulnerability Identified**: In `AimTelemetry.ts`, `foundPeak` triggered on any point with velocity $> 15.0^\circ/\text{s}$, and immediately declared a deceleration trough on the next sample if velocity leveled off. On uniform-speed flicks, this falsely declared the flick endpoint near the start of movement, triggering a false $9.0^\circ$ undershoot.
- **Remediation**: Ballistic deceleration troughs now require detecting peak velocity followed by a significant deceleration drop below $40\%$ of peak velocity (or $< 10.0^\circ/\text{s}$) prior to re-acceleration. Uniform flicks treat the click endpoint as the ballistic terminus, producing $0^\circ$ undershoot. Verified in `src/tests/groundTruthTelemetry.test.ts`.

### 2.3 Angular Radius Scaling for 3D Target Meshes (HIGH - FIXED)
- **Vulnerability Identified**: `TargetEntity.ts` hardcoded outer ring geometry radius to $0.6\text{m}$, ignoring the angular radius parameter passed by `TargetGenerator.ts`. Consequently, micro targets ($0.85^\circ$), medium targets ($1.25^\circ$), and large targets ($1.60^\circ$) had identical physical hitboxes.
- **Remediation**: Physical mesh radius is now computed trigonometrically from the angular radius:
  $$r = \text{distance} \times \tan\left(\theta_{\text{radius}} \times \frac{\pi}{180}\right)$$
  Verified in `src/tests/arena.test.ts`.

### 2.4 Raycast Center Reticle Alignment & Miss Registration (MEDIUM - FIXED)
- **Vulnerability Identified**: `ArenaManager.ts` only called `onHitCallback` when raycast intersections occurred. Misses were silent, leaving `missesCount` stuck at 0.
- **Remediation**: `ArenaManager.ts` now fires `onShotCallback(isHit, target, hitInfo)`. Misses correctly increment the misses counter, record the angular orientation at shot time, and allow the user to continue acquiring the target.

### 2.5 Frame-Rate Independence of Moving Targets (VERIFIED)
- In `TargetEntity.ts`, angular update equations strictly multiply angular velocity by `deltaTimeSec`. Verified across simulated 60 FPS, 144 FPS, and 240 FPS loops to yield identical angular displacement (error $< 0.0001^\circ$).

### 2.6 Decoupling of React State from High-Frequency Mouse Loop (VERIFIED)
- `RawInputEngine.ts` processes `mousemove` directly on `document` and buffers samples in memory. React state is updated strictly on target transitions, round completion, and calibration phase changes.
