# Master VALORANT acceptance

Date: 2026-10-03 (Asia/Muscat).

Automated functional gates: PASS. Overall hardware acceptance: PHYSICAL HUMAN VALIDATION REQUIRED. PASS below describes software evidence; it does not certify real mouse count fidelity, human visual judgment, actual hardware fullscreen/zoom behavior, or personal sensitivity validity.

## Final matrix

| System | Status | Evidence |
| --- | --- | --- |
| SETUP | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| SYSTEM CHECK | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| CALIBRATION | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| CALIBRATION SKIP | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| POINTER LOCK | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| RAW X | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| RAW Y | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| INPUT ORDERING | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| CAMERA YAW | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| CAMERA PITCH | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| SENSITIVITY SCALING | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| CROSSHAIR TRUE CENTER | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| CROSSHAIR/RAY ALIGNMENT | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| BULLET THROUGH CROSSHAIR | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| CENTER RAYCAST | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| TARGET COLLIDER | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| CENTER HIT | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| EDGE HIT | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| OUTSIDE MISS | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| SHOT DURING FAST FLICK | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| POST-CLICK DELTA EXCLUDED | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| GUN VISUAL | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| GUN ISOLATION | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| TRACER ALIGNMENT | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| TRAJECTORY CAPTURE | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| LEFT/RIGHT | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| UP/DOWN | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| DIAGONAL | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| REACTION TIME | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| MOVEMENT TIME | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| VELOCITY | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| OVERSHOOT | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| UNDERSHOOT | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| CORRECTIONS | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| ENDPOINT ERROR | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| PATH EFFICIENCY | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| MICRO TEST | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| MEDIUM TEST | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| LARGE TEST | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| SWITCHING | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| TRACKING | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| COARSE SEARCH | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| BRACKET | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| FINE SEARCH | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| CONFIRMATION | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| TRIALS REACH OPTIMIZER | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| OPTIMIZER RETURNS RESULT | PASS (programmatic) | Real session result persisted and rendered; browser-session.json |
| RESULT SURVIVES TRANSITION | PASS (programmatic) | Real session result persisted and rendered; browser-session.json |
| RESULTS PAGE OPENS | PASS (programmatic) | Real session result persisted and rendered; browser-session.json |
| SENSITIVITY DISPLAYED | PASS (programmatic) | Real session result persisted and rendered; browser-session.json |
| RANGE DISPLAYED | PASS (programmatic) | Real session result persisted and rendered; browser-session.json |
| CONFIDENCE DISPLAYED | PASS (programmatic) | Real session result persisted and rendered; browser-session.json |
| REAL METRICS DISPLAYED | PASS (programmatic) | Real session result persisted and rendered; browser-session.json |
| RESTART | PASS (programmatic) | Actual engine/coordinator regression + browser integration; see reports below |
| UNIT TESTS | PASS (programmatic) | 23 files / 176 tests |
| INTEGRATION TESTS | PASS (programmatic) | 23 files / 176 tests |
| E2E | PASS (programmatic) | Complete mounted session and ten clean-trial browser scenarios |
| PRODUCTION BUILD | PASS (programmatic) | TypeScript + Vite production build |
| PHYSICAL HUMAN VALIDATION | REQUIRED | Real physical mouse cannot be operated or certified by this agent |

## Recorded verification

- `npm test`: 23 files, 176 tests PASS, including 1,200 randomized exact-center shots, the previously failing seed, and six complete seeded search sessions.
- `npm run lint`: PASS with no lint warnings.
- `npm run build`: PASS; only a bundle-size advisory remains.
- `npm run test:e2e`: PASS, exit 0. Actual mounted React/Three.js/RawInputEngine/TestCoordinator/SensitivityOptimizer path; no optimizer mocks. 208 shooting actions include 13 warmup targets;195 valid measured trials across15 candidate blocks complete warmup→coarse→bracket→fine→confirmation→results. Recommendation0.276 and tested range displayed in this synthetic run; this is not a personal sensitivity recommendation. Complete raw event trajectories are retained, all captured events end no later than the shot, and arena teardown preserves the recommendation.
- The browser runner also passed full optional horizontal/vertical/three-click calibration, calibration skip, restart, Pointer Lock release/relock,20 unscored F3/F4 centered shots, and zero canvas/crosshair center offset at1920×1080,2560×1440,960×720. No page errors.
- `npm run test:e2e:trials`: PASS after final collider repair. All ten required scenarios validate immediate logical removal/one saved trial before rendering, duplicate-click exclusion, post-hit500/500 movement isolation, no target at119ms, and fresh capture at120ms.

## Follow-up one-trial-per-target gate

| Requirement | Status | Observed behavior |
| --- | --- | --- |
| Hit closes trial before effects | PASS | Target deactivates/removes synchronously; capture ends and TrialResult saves before cosmetics |
| Miss permits correction | PASS | First miss keeps target; second hit records false/true/2 |
| No duplicate trial or leak | PASS | Repeated click and gap movement leave completed trial unchanged |
| Short controlled spawn interval | PASS | No target at119ms; new target and zero counts at120ms |
| Complete trajectory persistence | PASS | rawTrajectory and fullTrajectory retained alongside downsampled display data |
| Slow100% accuracy not considered optimal | PASS | Fixed-distribution scoring uses movement time, stopping control, corrections, error, efficiency and continuous excursion penalties |
| Similar sensitivities yield range | PASS | Tested confirmation candidates with comparable scores define range |
| Required scenario loop | PASS | Fast, slow, overcorrect, undercorrect, miss→hit, left, right, vertical, diagonal, moving-click |

## Limits and required human actions

Run20 genuinely centered shots,10 misses in each direction and20 fast flick/clicks using a real mouse; compare expected/registered hits and error signs, then complete a personal session. Physical expected hits/registered hits/false misses have NOT been measured by the agent. Use F3 and unscored F4 for diagnosis.

Desktop browser zoom cannot reliably be measured from outerWidth or devicePixelRatio: reset to100% using Ctrl+0. Delivered event timestamps determine the shot; a freshly processed event may precede the next displayed frame. Confidence and scoring are session heuristics, not clinical or universally optimal estimates. A path0→8→10 without a detectable stop does not establish an intended undershoot; stopped/decelerated corrections are measured.

See MASTER-FUNCTIONAL-AUDIT.md, MASTER-REPAIR-PROGRESS.md, MASTER-VALIDATOR-REVIEW.md, CLEAN-TRIAL-QA.md and validation-artifacts/browser-session.json / clean-trials.json for evidence.

