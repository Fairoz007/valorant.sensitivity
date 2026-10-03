# Clean shooting trial browser validation

Date: 2026-10-03. Status: PASS.

`node scripts/browser-clean-trials.mjs` runs Chromium against the mounted React interface, Three.js arena, raw input engine, coordinator and real result store on an isolated Vite port 5176. It enters through setup and calibration skip, obtains real pointer lock, and uses browser mouse events. Deterministic stationary target plans replace randomized plans for reproducible scenarios; telemetry, shooting and saved results are not mocked.

The complete ten-scenario loop passed twice after fixing the harness clock to stay paused between controlled advances. Each scenario confirms synchronous removal and one saved trial in the mousedown call, before another rendering frame; a repeated click produces no duplicate result. Post-hit movement of 500/500 counts leaves the saved trial unchanged. At 119 ms no target exists; at 120 ms the next target exists with zero captured mouse travel. All completed trials have valid finite endpoint metrics and nonzero raw samples and travel.

| Scenario | Movement time | Verified distinction |
| --- | ---: | --- |
| Fast clean first-shot hit | 60 ms | No corrections |
| Slow accurate first-shot hit | 1000 ms | Same hit outcome; distinctly slower measurement |
| Overshoot then correction | 140 ms | Overshoot detected, one correction |
| Undershoot then correction | 220 ms | Undershoot detected, one correction |
| First miss then second-shot hit | 160 ms | Target persists on miss; firstShotHit=false, eventualHit=true, shotsRequired=2 |
| Left flick | 60 ms | LEFT direction |
| Right flick | 60 ms | RIGHT direction |
| Vertical flick | 60 ms | UP direction |
| Diagonal flick | 60 ms | UP_RIGHT direction |
| Rapid flick and immediate click | 20 ms | Final queued movement applied before center raycast |

No browser page errors occurred. Machine-readable evidence is in `validation-artifacts/clean-trials.json`, with a rendered arena screenshot in `validation-artifacts/clean-trials.png`.

This browser run validates the application pipeline using synthetic mouse events. It does not establish physical hardware polling behavior or human sensitivity validity. Independent optimizer/confidence/seeded Monte Carlo checks also passed (8 tests in 3 files).
