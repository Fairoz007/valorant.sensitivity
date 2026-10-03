# Master functional audit

## Repository and ownership

React/TypeScript/Vite, Zustand, Three.js, Vitest. There is no Git repository in this workspace and no repository AGENTS.md. Existing baseline: 13 test files, 107 tests passed, despite integration defects below.

Implementation agents: application_functions (views/store/lifecycle), gameplay (input/camera/targets/shooting), sensitivity (telemetry/coordinator/optimizer). The parent is MASTER-VALORANT-VALIDATOR, repeatedly checking integration, assigning failures, repairing QA/diagnostics, and rerunning affected regressions.

## Physical movement to result

1. `SetupView` records DPI/current sensitivity in `useAppStore`; `App` selects views by phase, rather than URL routes.
2. `SystemCheckView` calls `CalibrationManager.performSystemCheck`; calibration consumes RawInputEngine delta/click subscriptions and can be skipped. Calibration verifies directional movement and button input; it does not independently measure hardware CPI.
3. `ArenaView` constructs one RawInputEngine, ArenaManager, and TestCoordinator for the entire warmup/search session. Arena lifetime must survive search-phase changes.
4. Pointer Lock installs document mousemove/mousedown/mouseup listeners. movementX/Y enter an ordered timestamped buffer outside React. Unadjusted movement must be established by a real browser request; standard input has lower measurement certainty.
5. ArenaManager consumes input using one yaw constant times candidate sensitivity, with opposite browser dy for upward pitch. DPI only enters eDPI and cm/360 reporting. Camera quaternion and world matrices drive the rendered view and center-NDC ray.
6. Physical left mousedown flushes movement no later than the shot time, snapshots camera and target, and raycasts target geometry from the camera through NDC (0,0). Weapon mesh/tracer/audio are cosmetic.
7. The coordinator keeps an engagement alive after misses, captures mouse trajectory through corrections, and stores actual first-shot/eventual-hit/error/count/timing measurements in TrialResult. Targets use angular geometry; moving targets update with elapsed seconds.
8. Candidate blocks apply sensitivity to the actual camera and collect balanced trials. Coarse selects a region, bracket narrows it, fine identifies a provisional winner, confirmation tests fresh targets and may choose a neighbor.
9. Candidate metrics are built from valid finite gameplay trials. Optimizer/confidence/explanation produce one recommendation object; incomplete/invalid data produce an explicit failure, never fallback statistics.
10. The store persists recommendation before switching to results. ResultsView displays that object and real supporting statistics. Arena teardown only releases resources. A new test is the point where session data clears.

## Integration defects found before repair

- Arena sits below the navbar while crosshair is fixed to the window center.
- Input flush consumes post-click buffered events; browser event timestamps are ignored.
- Hardware samples record pre-update camera orientation and coordinator uses only frame samples.
- Pointer Lock is reported successful even when the API is missing.
- Target movement is not paused after lock/focus loss.
- Shot callback can dispose a target and spawn its replacement before shot cleanup/visual snapshot finishes.
- Tracer muzzle offset is applied in world axes.
- Target batteries use different seeds per candidate and absolute coordinates instead of current-camera offsets.
- Fatigue changes phase to rest without preserving the search transition and the UI never resumes the coordinator.
- Finalization assumes a winner and uses fabricated default accuracy/timing/directional scores and a fixed percentage range.
- Results silently show a missing payload; reset is incomplete.
- System diagnostics claim raw support and polling/refresh/zoom values without measurement.

## Timing and browser limits

JavaScript event order is authoritative only for events delivered by the browser. Physical hardware timestamps and events not yet delivered cannot be reconstructed. Rendered frames may precede the latest event-time camera state until the next display refresh; shot computation must still use pre-click delivered movement. Browser synthetic events verify software integration, not real mouse count fidelity. Desktop zoom cannot reliably be inferred from outerWidth or devicePixelRatio; users must reset browser zoom to 100%. Physical center/off-target/fast-flick acceptance remains REQUIRED.

See MASTER-REPAIR-PROGRESS.md and MASTER-VALORANT-ACCEPTANCE.md for final evidence rather than treating source inspection as a pass.
