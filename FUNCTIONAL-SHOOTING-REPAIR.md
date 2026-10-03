# FUNCTIONAL SHOOTING REPAIR CHECKLIST

## Pipeline Status

### Input Pipeline (Tasks 2–8)
- [x] Browser mouse input — `mousemove` events captured via `RawInputEngine.handleMouseMove`
- [x] Pointer Lock — `requestPointerLock({ unadjustedMovement: true })` with clean fallback
- [x] movementX — consumed from `MouseEvent.movementX` at L285 of RawInputEngine
- [x] movementY — consumed from `MouseEvent.movementY` at L286 of RawInputEngine
- [x] Candidate sensitivity — `ArenaManager.setSensitivity()` applied per-candidate by TestCoordinator
- [ ] Camera yaw — **BUG: ArenaView recreates engine on every phase transition, losing pointer lock**
- [x] Camera pitch — correct sign convention, clamped ±89.5°
- [x] Crosshair — fixed at viewport center via CSS `fixed top-1/2 left-1/2 -translate-x/y-1/2`

### Yaw Constant Unification
- [ ] **BUG: DUPLICATE CONSTANT** — `VALORANT_YAW_DEG_PER_COUNT` defined in BOTH `config/constants.ts` AND `engine/MathEngine.ts`
- [ ] **BUG: HARDCODED 0.06996** in `RawInputEngine.ts` L331 (not imported)
- [ ] **BUG: HARDCODED 0.06996** in `SetupView.tsx` L54 (cm/360 preview calculation)

### Shooting Pipeline (Tasks 11–18)
- [x] Target geometry — `TargetEntity` uses angular sizing with `RingGeometry` + `CircleGeometry`
- [x] Left click — `event.button === 0` checked in `handleMouseDown`
- [x] Shot timing — `performance.now()` timestamp passed to `processShot`
- [x] Camera snapshot — `getCameraOrientation()` called synchronously at shot time
- [x] Center raycast — `raycaster.setFromCamera(Vector2(0,0), camera)` correct
- [x] Hit detection — `intersectObjects(targetMeshes, true)` with parent traversal
- [x] Miss detection — falls through when no intersection found
- [x] Dummy gun — present, visual only, does NOT affect raycasting
- [x] Gun animation — `triggerFireAnimation()` fires AFTER measurement

### Telemetry Pipeline (Tasks 19–30)
- [x] Trajectory capture — `startTrialCapture()` / `endTrialCapture()` in RawInputEngine
- [x] Left/right analysis — directional count accumulators in RawInputEngine
- [x] Up/down analysis — same
- [x] Velocity — angular velocity computed per-sample
- [x] Overshoot — geometric projection-based detection in AimTelemetry
- [x] Undershoot — same
- [x] Corrections — direction reversal detection with noise floor
- [x] Endpoint error — haversine angular distance at click point
- [x] Path efficiency — `idealDistance / max(actualDistance, idealDistance)`
- [x] Candidate comparison — `SensitivityOptimizer.evaluateCandidate()`
- [x] Recommendation — `finalizeRecommendation()` in TestCoordinator

### Critical Bugs to Fix (Priority Order)
1. **ArenaView phase-change remount** — Destroys/recreates entire 3D arena on every phase transition
2. **Duplicate yaw constant** — Two separate `VALORANT_YAW_DEG_PER_COUNT` definitions
3. **Hardcoded 0.06996** in RawInputEngine and SetupView
4. **processShot camera sync** — Needs to flush pending deltas before snapshotting camera
5. **Missing `engine.dispose()`** — RawInputEngine not properly cleaned up in ArenaView

## Root Cause Analysis

### Bug 1: ArenaView Phase-Change Remount
**Location:** `ArenaView.tsx` L56 — `useEffect` depends on `[phase, ...]`
**Impact:** Every time phase changes (warmup→coarse→bracketing→fine→confirmation),
the entire 3D scene is destroyed and recreated, losing:
- Pointer lock (user must re-click canvas)
- Camera state
- All accumulated input data
- Animation frame loop
**Fix:** Remove `phase` from useEffect dependency array. Move phase-handling to coordinator.

### Bug 2: Duplicate Yaw Constant
**Location:** `config/constants.ts` L9 AND `engine/MathEngine.ts` L1
**Impact:** If either is changed independently, calculations become inconsistent.
**Fix:** Remove from MathEngine, import from constants.

### Bug 3: Hardcoded Yaw in RawInputEngine
**Location:** `RawInputEngine.ts` L331 — `const degPerCount = 0.06996 * sens;`
**Impact:** If constant is updated, this won't reflect the change.
**Fix:** Import from constants.

### Bug 4: processShot Camera Sync
**Location:** `ArenaManager.ts` L278
**Impact:** When user clicks while moving, pending deltas may not be applied yet.
**Fix:** Flush pending deltas (call `processInput()`) before capturing camera state.

### Bug 5: Missing `engine.dispose()`
**Location:** `ArenaView.tsx` L51-55
**Impact:** `arena.dispose()` is called but `engine.dispose()` is not.
**Fix:** Add `engine.dispose()` to cleanup.
