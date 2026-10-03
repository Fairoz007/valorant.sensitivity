import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

// Real mounted React/Three.js/RawInputEngine/coordinator/optimizer pipeline.
// Synthetic browser events replace the physical mouse only; no result mocks.
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5175', '--strictPort'], { stdio: 'ignore', windowsHide: true });
const baseURL = 'http://127.0.0.1:5175';
for (let retry = 0; retry < 100; retry++) {
  try { if ((await fetch(baseURL)).ok) break; } catch { /* Starting Vite. */ }
  await new Promise(resolve => setTimeout(resolve, 100));
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await mkdir('validation-artifacts', { recursive: true });
try {
  await page.goto(`${baseURL}/?e2e`);
  await page.locator('input[placeholder="800"]').fill('800');
  await page.locator('input[placeholder="0.30"]').fill('0.30');
  await page.locator('button[type="submit"]').click();
  await page.getByRole('button', { name: /Continue to Motion Calibration/ }).click();
  await page.getByRole('button', { name: /Skip/ }).click();
  await page.waitForFunction(() => !!window.__valorantArena);
  await page.clock.install();
  await page.evaluate(async () => {
    const { useAppStore } = await import('/src/store/useAppStore.ts');
    window.__validationStore = useAppStore;
    window.__firstArena = window.__valorantArena.arena;
  });
  const geometry = [];
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 960, height: 720 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => document.querySelector('canvas').getBoundingClientRect().width === innerWidth);
    await page.clock.runFor(32);
    geometry.push(await page.evaluate(() => {
      const canvas = document.querySelector('canvas').getBoundingClientRect();
      const cross = document.querySelector('#shooting-crosshair').getBoundingClientRect();
      return { viewport: [innerWidth, innerHeight], canvas: [canvas.x, canvas.y, canvas.width, canvas.height],
        errorX: cross.x + cross.width / 2 - canvas.x - canvas.width / 2,
        errorY: cross.y + cross.height / 2 - canvas.y - canvas.height / 2 };
    }));
  }
  console.log('Viewport geometry', JSON.stringify(geometry));
  for (const g of geometry) { assert.ok(Math.abs(g.errorX) < 0.51); assert.ok(Math.abs(g.errorY) < 0.51); }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.mouse.click(960, 540);
  await page.waitForFunction(() => window.__valorantArena.engine.isLocked());
  // Unscored stationary alignment mode: twenty exact center shots.
  await page.keyboard.press('F3');
  await page.keyboard.press('F4');
  await page.waitForFunction(() => window.__valorantArena.arena.isAlignmentCheck());
  const centerHits = await page.evaluate(() => {
    const { arena } = window.__valorantArena;
    let hits = 0;
    for (let i = 0; i < 20; i++) {
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
      if (arena.getLastShotDebug()?.isHit) hits++;
    }
    if (window.__validationStore.getState().allTrialResults.length !== 0) throw new Error('Diagnostic data entered measured session');
    return hits;
  });
  assert.equal(centerHits, 20);
  await page.screenshot({ path: 'validation-artifacts/alignment.png' });
  await page.keyboard.press('F4');
  await page.keyboard.press('F3');
  // Pointer-lock loss discards an interrupted trial and safely relocks.
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => !window.__valorantArena.engine.isLocked());
  await page.clock.runFor(1000);
  assert.equal(await page.evaluate(() => window.__validationStore.getState().allTrialResults.length), 0);
  await page.mouse.click(960, 540);
  await page.waitForFunction(() => window.__valorantArena.engine.isLocked());
  // Wait for the first trial's reaction latency, then send raw counts to aim.
  const phases = new Set();
  const candidates = new Map();
  let shots = 0;
  while (shots < 1500) {
    // The controlled inter-trial interval is excluded from aiming telemetry.
    await page.clock.runFor(150);
    const state = await page.evaluate(() => {
      const s = window.__validationStore.getState();
      if (window.__valorantArena && window.__firstArena !== window.__valorantArena.arena) throw new Error('Arena remounted');
      if (s.activeCandidate && window.__valorantArena && s.activeCandidate.sens !== window.__valorantArena.arena.getSensitivity()) throw new Error('Candidate not applied to camera');
      return { phase: s.phase, sens: s.activeCandidate?.sens, id: s.activeCandidate?.id, error: s.resultError };
    });
    phases.add(state.phase);
    if (state.id) candidates.set(state.id, state.sens);
    if (state.phase === 'results') break;
    if (state.phase === 'rest') {
      await page.clock.runFor(21000);
      continue;
    }
    await page.clock.runFor(100);
    await page.evaluate(() => {
      const { arena, engine } = window.__valorantArena;
      const target = arena.getActiveTargets()[0];
      if (!target) throw new Error('No active target in running phase');
      const camera = arena.getCameraOrientation();
      const deg = arena.getSensitivity() * 0.07;
      const dx = (target.yaw * 180 / Math.PI - camera.yawDeg) / deg * 0.8;
      const dy = -(target.pitch * 180 / Math.PI - camera.pitchDeg) / deg * 0.8;
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: Math.round(dx), movementY: Math.round(dy) }));
      if (!engine.isLocked()) throw new Error('Pointer lock lost');
    });
    await page.clock.runFor(80);
    await page.evaluate(() => {
      const { arena } = window.__valorantArena;
      const target = arena.getActiveTargets()[0];
      const cam = arena.getCameraOrientation();
      const deg = arena.getSensitivity() * 0.07;
      document.dispatchEvent(new MouseEvent('mousemove', {
        movementX: Math.round((target.yaw * 180 / Math.PI - cam.yawDeg) / deg),
        movementY: Math.round(-(target.pitch * 180 / Math.PI - cam.pitchDeg) / deg),
      }));
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      if (arena.getLastShotDebug()?.isHit && arena.getActiveTargets().length !== 0) throw new Error('Hit target remained logically visible');
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    });
    shots++;
    if (shots % 100 === 0) console.log(`Browser validator: ${shots} shots, ${state.phase}`);
  }
  await page.clock.runFor(100);
  const final = await page.evaluate(() => {
    const s = window.__validationStore.getState();
    const r = s.finalRecommendation;
    return { phase: s.phase, status: s.resultStatus, error: s.resultError, result: r,
      trialCount: s.allTrialResults.length, validTrials: s.allTrialResults.filter(t => t.isValid).length,
      candidateCount: new Set(s.allTrialResults.map(t => t.candidateId)).size,
      rawCount: s.allTrialResults.reduce((n, t) => n + t.rawCounts.totalRawVectorTravel, 0),
      completeTrajectories: s.allTrialResults.every(t => t.rawTrajectory?.length === t.rawSamplesCount && t.fullTrajectory?.length >= t.trajectorySummary.length && t.rawTrajectory.every(p => p.timestamp <= t.shotTime)),
      arenaTornDown: !window.__valorantArena };
  });
  assert.equal(final.phase, 'results', JSON.stringify(final));
  assert.ok(final.result, `Missing recommendation: ${final.error}`);
  assert.ok(Number.isFinite(final.result.recommendedSens) && final.result.recommendedSens > 0);
  assert.ok(final.result.recommendedRange[0] <= final.result.recommendedSens);
  assert.ok(final.result.recommendedRange[1] >= final.result.recommendedSens);
  assert.ok(final.trialCount > 0 && final.validTrials > 0 && final.candidateCount > 1 && final.rawCount > 0);
  assert.ok(final.completeTrajectories, 'Full event trajectories were not persisted');
  for (const phase of ['warmup', 'coarse', 'bracketing', 'fine', 'confirmation', 'results']) assert.ok(phases.has(phase), phase);
  await page.getByText(final.result.recommendedSens.toFixed(3), { exact: true }).first().waitFor();
  assert.equal(errors.length, 0, errors.join('\n'));
  await page.screenshot({ path: 'validation-artifacts/results.png', fullPage: true });
  await writeFile('validation-artifacts/browser-session.json', JSON.stringify({ shots, centerHits, pointerLockResume: true, phases: [...phases], candidates: [...candidates], geometry, errors, ...final }, null, 2));
  console.log(JSON.stringify({ shots, phases: [...phases], trialCount: final.trialCount, validTrials: final.validTrials, candidateCount: final.candidateCount, recommendedSens: final.result.recommendedSens, geometry, errors }));
  await page.getByRole('button', { name: 'Start New Session' }).click();
  const restarted = await page.evaluate(() => {
    const s = window.__validationStore.getState();
    return s.phase === 'setup' && s.allTrialResults.length === 0 && s.finalRecommendation === null;
  });
  assert.ok(restarted);
  // Exercise the optional calibration path as actual browser event input.
  await page.locator('button[type="submit"]').click();
  await page.getByRole('button', { name: /Continue to Motion Calibration/ }).click();
  await page.getByRole('button', { name: 'Click to Lock Pointer & Calibrate' }).click();
  await page.waitForFunction(() => !!document.pointerLockElement);
  const calibration = await page.evaluate(async () => {
    const { calibrationManager } = await import('/src/calibration/CalibrationManager.ts');
    for (const dx of [80, -80, 80, -80, 80]) document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx }));
    for (const dy of [60, -60, 60, -60, 60]) document.dispatchEvent(new MouseEvent('mousemove', { movementY: dy }));
    return calibrationManager.getStep();
  });
  assert.equal(calibration, 'click-calibration');
  for (let i = 0; i < 3; i++) {
    await page.clock.runFor(100);
    await page.evaluate(() => { document.dispatchEvent(new MouseEvent('mousedown', { button: 0 })); document.dispatchEvent(new MouseEvent('mouseup', { button: 0 })); });
  }
  assert.equal(await page.evaluate(async () => (await import('/src/calibration/CalibrationManager.ts')).calibrationManager.getStep()), 'complete');
  console.log('Browser optional calibration and restart PASS');
} catch (error) {
  await page.screenshot({ path: 'validation-artifacts/browser-failure.png', fullPage: true });
  console.error(await page.locator('body').innerText());
  throw error;
} finally { await browser.close(); server.kill(); }
