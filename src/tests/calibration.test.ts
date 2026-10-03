import { describe, it, expect, beforeEach } from 'vitest';
import { CalibrationManager } from '../calibration/CalibrationManager';

describe('CalibrationManager', () => {
  let calib: CalibrationManager;

  beforeEach(() => {
    calib = new CalibrationManager();
    calib.setStep('horizontal-motion');
  });

  it('ignores minor jitter and sensor noise during horizontal motion', () => {
    // Feed micro jitter: +1, -1, +2, -1
    calib.processCalibrationDelta(1, 0);
    calib.processCalibrationDelta(-1, 0);
    calib.processCalibrationDelta(2, 0);
    calib.processCalibrationDelta(-1, 0);

    const stats = calib.getMotionStats();
    expect(stats.horizontalSwipes).toBe(0);
    expect(calib.getStep()).toBe('horizontal-motion');
  });

  it('correctly detects 4 horizontal swipes and advances to vertical motion', () => {
    // 1. Initial movement RIGHT (accumulate > 50)
    for (let i = 0; i < 10; i++) calib.processCalibrationDelta(8, 0);
    expect(calib.getMotionStats().horizontalSwipes).toBe(0);
    expect(calib.getMotionStats().currentHorizontalDir).toBe('RIGHT');

    // 2. Reversal to LEFT (accumulate < -50) -> Swipe 1
    for (let i = 0; i < 10; i++) calib.processCalibrationDelta(-8, 0);
    expect(calib.getMotionStats().horizontalSwipes).toBe(1);
    expect(calib.getMotionStats().currentHorizontalDir).toBe('LEFT');

    // 3. Reversal to RIGHT (accumulate > 50) -> Swipe 2
    for (let i = 0; i < 10; i++) calib.processCalibrationDelta(8, 0);
    expect(calib.getMotionStats().horizontalSwipes).toBe(2);
    expect(calib.getMotionStats().currentHorizontalDir).toBe('RIGHT');

    // 4. Reversal to LEFT -> Swipe 3
    for (let i = 0; i < 10; i++) calib.processCalibrationDelta(-8, 0);
    expect(calib.getMotionStats().horizontalSwipes).toBe(3);
    expect(calib.getMotionStats().currentHorizontalDir).toBe('LEFT');

    // 5. Reversal to RIGHT -> Swipe 4 -> transitions to vertical-motion!
    for (let i = 0; i < 10; i++) calib.processCalibrationDelta(8, 0);
    expect(calib.getMotionStats().horizontalSwipes).toBe(4);
    expect(calib.getStep()).toBe('vertical-motion');
  });

  it('correctly detects 4 vertical swipes and advances to click calibration', () => {
    calib.setStep('vertical-motion');

    // 1. Initial movement DOWN (accumulate > 40)
    for (let i = 0; i < 10; i++) calib.processCalibrationDelta(0, 6);
    expect(calib.getMotionStats().verticalSwipes).toBe(0);
    expect(calib.getMotionStats().currentVerticalDir).toBe('DOWN');

    // 2. Reversal UP (accumulate < -40) -> Swipe 1
    for (let i = 0; i < 10; i++) calib.processCalibrationDelta(0, -6);
    expect(calib.getMotionStats().verticalSwipes).toBe(1);
    expect(calib.getMotionStats().currentVerticalDir).toBe('UP');

    // 3. Reversal DOWN -> Swipe 2
    for (let i = 0; i < 10; i++) calib.processCalibrationDelta(0, 6);
    expect(calib.getMotionStats().verticalSwipes).toBe(2);

    // 4. Reversal UP -> Swipe 3
    for (let i = 0; i < 10; i++) calib.processCalibrationDelta(0, -6);
    expect(calib.getMotionStats().verticalSwipes).toBe(3);

    // 5. Reversal DOWN -> Swipe 4 -> transitions to click-calibration!
    for (let i = 0; i < 10; i++) calib.processCalibrationDelta(0, 6);
    expect(calib.getMotionStats().verticalSwipes).toBe(4);
    expect(calib.getStep()).toBe('click-calibration');
  });

  it('requires 3 debounced left clicks to complete calibration', () => {
    calib.setStep('click-calibration');

    // Right click (button 1) should be ignored
    expect(calib.registerCalibrationClick(1, 100)).toBe(false);
    expect(calib.getClicksCompleted()).toBe(0);

    // Click 1 (left click, button 0)
    expect(calib.registerCalibrationClick(0, 200)).toBe(false);
    expect(calib.getClicksCompleted()).toBe(1);

    // Debounce test: rapid bounce click 30ms later should be ignored
    expect(calib.registerCalibrationClick(0, 230)).toBe(false);
    expect(calib.getClicksCompleted()).toBe(1);

    // Click 2 (left click 150ms later)
    expect(calib.registerCalibrationClick(0, 380)).toBe(false);
    expect(calib.getClicksCompleted()).toBe(2);

    // Click 3 (left click 150ms later) -> Completes calibration!
    expect(calib.registerCalibrationClick(0, 530)).toBe(true);
    expect(calib.getClicksCompleted()).toBe(3);
    expect(calib.getStep()).toBe('complete');
  });

  it('handles long continuous vertical travel (e.g. 500 counts) before reversal without swallowing the reversal', () => {
    calib.setStep('vertical-motion');

    // User moves DOWN by 500 counts (huge swipe across desk)
    for (let i = 0; i < 50; i++) calib.processCalibrationDelta(0, 10);
    expect(calib.getMotionStats().currentVerticalDir).toBe('DOWN');
    expect(calib.getMotionStats().verticalSwipes).toBe(0);

    // User reverses and moves UP by only 30 counts
    // Under the old bug, this required 540 counts to reverse and would fail completely.
    // Under the fix, it registers immediately after threshold!
    for (let i = 0; i < 3; i++) calib.processCalibrationDelta(0, -10);
    expect(calib.getMotionStats().currentVerticalDir).toBe('UP');
    expect(calib.getMotionStats().verticalSwipes).toBe(1);
  });

  it('handles vertical motion with diagonal contamination and minor jitter', () => {
    calib.setStep('vertical-motion');

    // Initial movement DOWN with horizontal drift (e.g. natural diagonal hand movement)
    for (let i = 0; i < 5; i++) calib.processCalibrationDelta(12, 8);
    expect(calib.getMotionStats().currentVerticalDir).toBe('DOWN');

    // Reversal UP with a tiny jitter packet (+1) in between
    calib.processCalibrationDelta(-5, -12);
    calib.processCalibrationDelta(3, 1);   // minor jitter packet
    calib.processCalibrationDelta(-4, -15);
    // Net upward motion: 12 - 1 + 15 = 26 >= 25 threshold!
    expect(calib.getMotionStats().currentVerticalDir).toBe('UP');
    expect(calib.getMotionStats().verticalSwipes).toBe(1);
  });
});
