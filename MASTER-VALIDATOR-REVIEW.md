# MASTER-VALORANT-VALIDATOR independent review

Date: 2026-10-03

Final root acceptance update: 23files/176tests PASS, lint PASS, production build PASS. Full browser session PASS with195validtrials/15blocks/208shootingactions; allphases and displayed finite0.276 syntheticrecommendation, complete rawtrajectory persistence, calibration/skip/restart, pointerlockresume,20unscored diagnosticcenters and viewportalignment PASS, no pageerrors. Ten clean-trial browser scenarios PASS after exactpolygon collider repair. Root also eliminated listener-startup race when PointerLock promise resolves before its change event and added an automated regression. Hardwarehuman acceptance remains REQUIRED.

## Scope and review loop

Reviewed the requested complete mission and the repaired input → camera → center ray → target → shot → trajectory → trial → candidate → phase → recommendation chain. The validator did not run a second browser session concurrently with the root agent's full browser E2E. Browser evidence is recorded by the root run separately in validation-artifacts.

Loop 1 found a real telemetry geometry inconsistency: progress used unscaled yaw/pitch displacement, but overshoot compared it with great-circle target distance. At high camera pitch, a perfect yaw flick falsely counted as overshoot. Replaced progress with great-circle displacement projected onto the starting orientation's target tangent. A 20-degree yaw flick at 75-degree pitch now ends with zero error and zero overshoot.

Loop 2 found missing explicit acceleration/deceleration output and same-direction secondary pushes not counted as corrections. Added positive peak acceleration/deceleration in degrees per second squared, persisted to TrialResult; a stopped flick at 8 degrees followed by a continuation to 10 degrees reports 2 degrees undershoot and one correction. Invalid supplied velocity is reconstructed, and the initial velocity is normalized to finite nonnegative data.

Loop 3 reran the complete available unit/integration suite after the fixes and other agents' final changes. No further failing automated assertion remained. All 148 tests in 18 files passed on the final validator run. The production build passed after correcting an encoding issue in the newly added unit comment; Vite reported only the existing large bundle advisory.

## Exact changed files

- src/engine/AimTelemetry.ts
- src/types/index.ts
- src/arena/TestCoordinator.ts (acceleration/deceleration result mapping only)
- src/tests/validatorTelemetryRegression.test.ts

## Evidence and limitations

The regression suite contains ordered pre-click input exclusion, spherical camera/ray and collider checks, telemetry ground truths, candidate and optimizer validity checks, completion/result persistence, and integration session tests. The validator independently added high-pitch perfect-shot telemetry, invalid velocity recovery, acceleration/deceleration units, and undershoot continuation checks.

A bare trajectory 0 → 8 → 10 degrees without timestamps, velocity shape, or a stop cannot identify whether 8 degrees was an intentional primary flick endpoint. Labeling every such point an undershoot would misclassify normal smooth movement. Undershoot classification therefore requires a detectable ballistic stop/deceleration followed by renewed movement. This inference limitation is intentional and should not be reported as a physically observed endpoint.

Browser scheduling cannot guarantee a newly processed mouse event has already reached a displayed frame when a physical mousedown arrives. The shot snapshots the authoritative event-time camera; display latency and physical sensor/count equivalence still need hardware observation.

PHYSICAL HUMAN VALIDATION: REQUIRED.

Required human acceptance: 20 center shots; 10 off-target shots each left/right/above/below with error signs; 20 fast flick-and-click shots checking no lost/duplicate/stale shots; comparison with real VALORANT mouse feel; one complete hardware-driven session through results; Alt+Tab/pointer-lock interruption and relock; zoom/fullscreen and normal device-pixel-ratio behavior. No physical mouse validation is claimed here.

## Follow-up sensitivity analysis and scoring repair

The requested fast clean 100% hits / slow clean 100% hits / corrected 100% hits comparison now has direct regression coverage. Candidate speed scoring uses measured movement time, separately from reaction latency. Control scoring includes measured stopping quality. Continuous overshoot/undershoot rates and normalized excursion magnitudes replace binary rate cutoffs, so real excursions below 35% are not ignored. Non-finite or nonpositive target radii cannot reach normalized excursion scoring.

Confidence requires the minimum valid trial count for every candidate and a four-point winner separation, preventing one well-sampled candidate from hiding an undersampled neighbor. Measured performance plateaus produce a moderate, broader range instead of a precise high-confidence result.

The 10,000-session synthetic Monte Carlo experiment now seeds both telemetry generation and candidate shuffling, restores the random spy after each test, checks the 95th percentile too, and derives each report PASS/FAIL from observed results. Current synthetic observations: 90th percentile error 3.04%; 95th 3.51%; range coverage 99.36%; 524 HIGH cases with one >8% error (0.19%). These are generated synthetic data findings, not physical performance guarantees.

Browser evidence received from root: full real application browser run passed with 208 shooting actions including 13 warmup and 195 valid scored trials in 15 blocks; every phase visited; 0.300 recommended sensitivity visible; zero page errors; three viewport sizes centered exactly; 20 F3/F4 center diagnostic hits excluded from scored trials; pointer-lock release/relock restarted the interrupted trial; restart reset results; optional horizontal/vertical calibration and three debounced input clicks passed. Root owns the runnable script and artifacts.

## Final-loop stress discovery

A new seeded center-shot stress gate (src/tests/validatorCenterStress.test.ts) passed 1,200 randomized exact-center shots through RawInputEngine across sensitivity and camera orientations. It then found a reproducible failure in the third of six seeded complete sessions: confirmation shot index 184 aimed mathematically exactly at yaw -1.481802868941486 / pitch 1.979795599193124, reported angular error 7.16e-16 degrees, but returned a miss. This gate correctly blocks programmatic acceptance until the shooting repair agent resolves the root cause and the exact same seeded session passes. No failed check is hidden by repeated passing runs.

Confidence output remains a heuristic score from measured sample size, validity, confirmation, separation and hardware integrity. Its numerical score is not a calibrated probability that the recommended sensitivity is physically optimal. Monte Carlo statistics describe the stated synthetic model only.

## Final repaired stress gate and regression outcome

The shooting agent replaced shared-vertex triangle-fan hit testing with ray-plane intersection against the exact visible 256-sided polygon boundary. The original failing seeded confirmation shot now passes. Reran the identical seed through all six full sessions; each completed all phases and produced a finite recommendation with at least 14 measured candidate blocks and 182 trials. The optional additional current-sensitivity confirmation block can raise this to 15 blocks / 195 trials, so the gate checks the required schedule rather than demanding an optional block. All 1,200 isolated randomized center shots also pass.

Final independent loop after the collider repair: 175 tests in 23 files PASS; lint PASS; production build PASS. The bundle-size advisory is still present. The root agent is rerunning the final browser flow after the collider repair and owns browser acceptance evidence. The validator's geometric/shot/session loop found and fixed a failure that previous broad passing test runs did not expose.

PHYSICAL HUMAN VALIDATION: REQUIRED. Programmatic checks do not claim operation of the user's physical mouse or real VALORANT comparison.
