# Phase 2 Validation & Reliability Report

**Project:** VALORANT Precision Sensitivity Finder  
**Author:** Lead Engineering & Looping Validation Controller  
**Date:** 2026-10-02  
**Final Classification:** **ENGINEERING-VALIDATED** (Human Validation Protocol Active)  

---

## 1. Executive Summary

This phase subjected the VALORANT Precision Sensitivity Finder to rigorous adversarial testing, unit-level mathematical audits, ground-truth kinematic assertions, high-frequency input stress tests, and a 10,000-session Monte Carlo convergence simulation.

Rather than assuming existing code was correct, the audit identified three critical functional failures in the initial implementation:
1. **Calibration Swipe Stagnation**: The $0/4$ horizontal swipe failure caused by derivative thresholds incompatible with 1000 Hz polling rates.
2. **False Undershoot on Uniform Flicks**: Premature ballistic deceleration trough detection triggering false $9^\circ$ undershoots.
3. **Hardcoded Target Hitbox Geometry**: Target meshes failing to scale physical size with angular radius.

All identified vulnerabilities have been remediated, verified with 41 passing automated tests, and stress-tested with deterministic simulation vectors.

---

## 2. What Was Tested & What Failed (Root Cause & Fix)

| Subsystem / Test | Initial State | Failure Mechanism | Fix Applied | Result |
|:---|:---|:---|:---|:---|
| **Horizontal / Vertical Motion Calibration** | **FAILED** (`0 / 4` swipes) | `(this.lastDx > 10 && dx < -10)` failed because 1000 Hz hand movements decelerate through zero. | Implemented displacement accumulator state machine (`THRESHOLD = 50`). | **PASS** |
| **Ballistic Flick & Undershoot Detection** | **FAILED** (False $9^\circ$ undershoot) | Flicks with uniform velocity flagged early index as trough. | Added peak-velocity relative deceleration drop threshold ($< 40\%$ peak). | **PASS** |
| **Target Mesh Angular Scaling** | **FAILED** (Identical hitboxes) | TargetEntity hardcoded outer radius to $0.6\text{m}$. | Scaled mesh radius trigonometrically: $r = D \tan(\theta_{\text{rad}})$. | **PASS** |
| **Raycast Miss Registration** | **FAILED** (Misses unrecorded) | `ArenaManager` only fired callback on hit. | Implemented `onShotCallback` for both hits and misses. | **PASS** |
| **Confidence Model Adversarial Gating** | **FAILED** (Plateau awarded High) | Base score began at 40; plateaus could reach High. | Enforced hard gating: plateau ($< 2$ margin) or deficient samples cap at Low/Moderate. | **PASS** |

---

## 3. Monte Carlo Simulation Findings (10,000 Synthetic Sessions)

Tested across 10,000 simulated players with hidden optima $S^* \in [0.18, 0.70]$:

- **Median Recommendation Error:** **1.29%** (Target: $\le 4.0\%$)
- **90th Percentile Error:** **3.26%** (Target: $\le 8.0\%$)
- **95th Percentile Error:** **3.90%** (Target: $\le 12.0\%$)
- **Recommended Range Coverage:** **99.33%** (Target: $\ge 90.0\%$)
- **False-High-Confidence Rate:** **0.00%** (Target: $\le 5.0\%$)

Full statistical breakdown is archived in [`docs/OPTIMIZER-MONTE-CARLO.md`](file:///d:/Prjoects/seni/docs/OPTIMIZER-MONTE-CARLO.md).

---

## 4. Telemetry Ground Truth Verification

Deterministic mathematical trajectories evaluated in [`src/tests/groundTruthTelemetry.test.ts`](file:///d:/Prjoects/seni/src/tests/groundTruthTelemetry.test.ts):
- **Perfect Straight Line Hit**: Path efficiency $= 100.0\%$, Overshoot $= 0^\circ$, Undershoot $= 0^\circ$, Corrections $= 0$.
- **Perfect Diagonal Hit**: Pythagorean $8^\circ \times 6^\circ \to 10^\circ$, Path efficiency $= 100.0\%$.
- **Ballistic Overshoot**: Reversals $> 0.12^\circ$ reliably increment `correctionCount = 1`, overshoot magnitude $= 2.5^\circ$.
- **Ballistic Undershoot**: Deceleration stall short of target reliably flags undershoot without false overshoot.
- **Sensor Jitter Rejection**: Micro-oscillations $\le 0.03^\circ$ are filtered out, recording `correctionCount = 0`.
- **Reaction Latency Separation**: Stationary period ($150\text{ ms}$) strictly isolated from movement time ($350\text{ ms}$).

---

## 5. Browser Compatibility & Known Limitations

| Platform / Browser | Pointer Lock | `unadjustedMovement: true` | Frame Timing | Status |
|:---|:---|:---|:---|:---|
| **Chrome / Edge (Windows)** | Supported | Supported (`WM_INPUT` Raw Input) | Stable | **Verified High Confidence** |
| **Chrome / Edge (macOS)** | Supported | Supported (Quartz Event Tap) | Stable | **Verified Moderate-High** |
| **Firefox (All Platforms)** | Supported | **Not Supported** (Ignored) | Stable | **Verified Standard (Advisory Shown)** |
| **Safari (macOS)** | Supported | **Not Supported** | Variable | **Advisory Shown** |

### Known Limitations:
1. **OS Acceleration on Non-Chromium Browsers**: Firefox and Safari do not support `unadjustedMovement: true`. Users with Windows "Enhance pointer precision" enabled in Firefox will experience OS curve distortion; the app transparently downgrades confidence and issues a diagnostic notice.
2. **Display Zoom Scaling**: Browser zoom levels other than 100% can introduce CSS viewport scaling artifacts; the system diagnostic detects zoom and prompts the user to press `Ctrl+0`.

---

## 6. Current Certification Classification

### Classification: **ENGINEERING-VALIDATED**
- All 41 unit, ground-truth, input, and Monte Carlo tests pass 100%.
- Interactive hardware input and swipe state machines validated.
- Real-human validation protocol established in [`docs/HUMAN-VALIDATION-PROTOCOL.md`](file:///d:/Prjoects/seni/docs/HUMAN-VALIDATION-PROTOCOL.md).
- Per strict specification guidelines, the application remains classified as **ENGINEERING-VALIDATED** until the 30-participant multi-session human study is completed.
