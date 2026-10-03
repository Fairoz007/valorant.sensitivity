import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5176', '--strictPort'], { stdio: 'ignore', windowsHide: true });
const url = 'http://127.0.0.1:5176';
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(url)).ok) break; } catch {}
  await new Promise(r => setTimeout(r, 100));
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const scenarios = [
  { name: 'fast clean hit', yaw: 10, pitch: 0, steps: [[100, .2], [60, 1]] },
  { name: 'slow accurate hit', yaw: 10, pitch: 0, steps: [[100, .2], [1000, 1]] },
  { name: 'overshoot correction hit', yaw: 10, pitch: 0, steps: [[100, .2], [60, 1.3], [80, 1]] },
  { name: 'undershoot correction hit', yaw: 10, pitch: 0, steps: [[100, .2], [80, .6], [80, .6], [60, 1]] },
  { name: 'miss then hit', yaw: 10, pitch: 0, steps: [[100, .2], [80, .6, true], [80, 1]] },
  { name: 'left flick', yaw: -10, pitch: 0, steps: [[100, .2], [60, 1]] },
  { name: 'right flick', yaw: 10, pitch: 0, steps: [[100, .2], [60, 1]] },
  { name: 'vertical flick', yaw: 0, pitch: 10, steps: [[100, .2], [60, 1]] },
  { name: 'diagonal flick', yaw: 8, pitch: 6, steps: [[100, .2], [60, 1]] },
  { name: 'rapid moving flick click', yaw: 10, pitch: 0, steps: [[100, .2], [10, .7], [10, 1]] },
];
const results = [];
try {
  await page.goto(`${url}/?e2e`);
  await page.locator('input[placeholder="800"]').fill('800');
  await page.locator('input[placeholder="0.30"]').fill('0.30');
  await page.locator('button[type="submit"]').click();
  await page.getByRole('button', { name: /Continue to Motion Calibration/ }).click();
  await page.getByRole('button', { name: /Skip/ }).click();
  await page.waitForFunction(() => !!window.__valorantArena);
  await page.mouse.click(960, 540);
  await page.waitForFunction(() => window.__valorantArena.engine.isLocked());
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.evaluate(async () => {
    window.__qaStore = (await import('/src/store/useAppStore.ts')).useAppStore;
    window.__qaStore.getState().setPhase('coarse');
    window.__valorantArena.coordinator.startPhase('coarse');
  });
  for (const scenario of scenarios) {
    const before = await page.evaluate(s => {
      const { arena, coordinator } = window.__valorantArena;
      coordinator.cancelPendingSpawn();
      arena.resetCamera();
      coordinator.currentTargets = [{ id: s.name, yaw: s.yaw, pitch: s.pitch, radius: .5, scenario: 'medium' }, { id: `${s.name}-next`, yaw: -5, pitch: 3, radius: .5, scenario: 'medium' }];
      coordinator.currentTargetIdx = 0;
      coordinator.spawnNextTarget();
      return window.__qaStore.getState().allTrialResults.length;
    }, scenario);
    for (const [delay, fraction, miss] of scenario.steps) {
      await page.clock.runFor(delay);
      await page.evaluate(({ s, fraction, miss }) => {
        const { arena } = window.__valorantArena;
        const cam = arena.getCameraOrientation();
        const deg = arena.getSensitivity() * .07;
        document.dispatchEvent(new MouseEvent('mousemove', { movementX: Math.round((s.yaw * fraction - cam.yawDeg) / deg), movementY: Math.round(-(s.pitch * fraction - cam.pitchDeg) / deg) }));
        if (miss) {
          document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
          document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
          if (arena.getActiveTargets().length !== 1) throw new Error('First miss removed target');
        }
      }, { s: scenario, fraction, miss });
    }
    const result = await page.evaluate(before => {
      const { arena } = window.__valorantArena;
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
      const trials = window.__qaStore.getState().allTrialResults;
      if (arena.getActiveTargets().length !== 0) throw new Error('Target remained after synchronous hit');
      if (trials.length !== before + 1) throw new Error('Hit did not synchronously save exactly one trial');
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
      if (window.__qaStore.getState().allTrialResults.length !== before + 1) throw new Error('Repeated click created duplicate trial');
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: 500, movementY: 500 }));
      return structuredClone(trials.at(-1));
    }, before);
    assert.equal(result.isValid, true, scenario.name);
    assert.equal(result.eventualHit, true);
    assert.equal(result.firstShotHit, scenario.name !== 'miss then hit');
    assert.equal(result.shotsRequired, scenario.name === 'miss then hit' ? 2 : 1);
    const direction = scenario.yaw < 0 ? 'LEFT' : scenario.yaw === 0 ? 'UP' : scenario.pitch > 0 ? 'UP_RIGHT' : 'RIGHT';
    assert.equal(result.targetDirection, direction);
    assert.ok(Number.isFinite(result.totalEndpointErrorDeg) && result.totalEndpointErrorDeg < .5);
    assert.ok(result.rawSamplesCount > 0 && result.rawCounts.totalRawVectorTravel > 0);
    if (scenario.name.startsWith('overshoot')) { assert.equal(result.isOvershoot, true); assert.ok(result.correctionCount >= 1); }
    if (scenario.name.startsWith('undershoot')) { assert.equal(result.isUndershoot, true); assert.ok(result.correctionCount >= 1); }
    await page.clock.runFor(119);
    assert.equal(await page.evaluate(() => window.__valorantArena.arena.getActiveTargets().length), 0);
    await page.clock.runFor(1);
    const next = await page.evaluate(() => ({ targets: window.__valorantArena.arena.getActiveTargets().length, counts: window.__valorantArena.engine.getDebugStats().counts.totalRawVectorTravel, saved: window.__qaStore.getState().allTrialResults.at(-1) }));
    assert.equal(next.targets, 1);
    assert.equal(next.counts, 0, 'Gap input leaked into new trial');
    assert.deepEqual(next.saved, result, 'Post-hit input mutated completed trial');
    results.push({ name: scenario.name, movementMs: result.movementTimeMs, corrections: result.correctionCount, overshoot: result.isOvershoot, undershoot: result.isUndershoot, direction: result.targetDirection, rawSamples: result.rawSamplesCount, immediateRemoval: true, cleanNextTrial: true });
  }
  assert.ok(results[1].movementMs > results[0].movementMs * 5);
  assert.equal(errors.length, 0, errors.join('\n'));
  await mkdir('validation-artifacts', { recursive: true });
  await page.screenshot({ path: 'validation-artifacts/clean-trials.png' });
  await writeFile('validation-artifacts/clean-trials.json', JSON.stringify({ date: '2026-10-03', results, errors }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); server.kill(); }
