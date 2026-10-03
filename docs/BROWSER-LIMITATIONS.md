# Browser Input Limitations, Pointer Lock & Raw Input Capabilities

**Project:** VALORANT Precision Sensitivity Finder  
**Author:** Lead Systems & Input Subagent  
**Date:** 2026-10-02  
**Status:** Canonical Reference  

---

## 1. Overview of Browser Mouse Input in Web Standards

Standard DOM `MouseEvent` objects expose client/screen coordinates (`clientX`, `clientY`, `screenX`, `screenY`). These coordinates suffer from severe limitations for FPS simulation:
1. **Screen Clamping**: Cursor ceases delivering movement events when it hits physical display edges.
2. **OS Pointer Ballistics**: The operating system applies non-linear acceleration curves (e.g. Windows "Enhance Pointer Precision") altering pixel distance based on hand speed.
3. **Display Scaling & Zoom**: CSS pixels do not equal physical sensor counts.

## 2. Pointer Lock API & `unadjustedMovement`

### 2.1 The Standard
W3C Pointer Lock Level 2 provides:
- Coordinate decoupling: Hides the OS cursor and provides infinite relative movement via `movementX` and `movementY`.
- `unadjustedMovement`: An options dictionary passed to `requestPointerLock`:
  ```typescript
  const promise = element.requestPointerLock({
    unadjustedMovement: true
  });
  ```

### 2.2 Cross-Browser Support Matrix

| Browser / Platform | `requestPointerLock()` | `unadjustedMovement: true` | Underlying OS Implementation | Confidence Impact |
|:---|:---|:---|:---|:---|
| **Chrome / Edge (Windows)** | Supported | **Full Support** | `WM_INPUT` (Raw Input, bypasses OS curve) | **High Confidence** |
| **Chrome / Edge (macOS)** | Supported | Partial (system acceleration disabled where allowed) | Quartz Event Tap / IOKit | **Moderate Confidence** |
| **Chrome / Edge (Linux)** | Supported | Full Support | X11 XI2 / Wayland Relative Pointer | **High Confidence** |
| **Firefox (All OS)** | Supported | **Ignored / Not Supported** | Standard Pointer Lock (OS curve applied) | **Moderate Warning** |
| **Safari (macOS/iPadOS)** | Supported | **Not Supported** | Standard Pointer Lock | **Moderate Warning** |

### 2.3 Capability Detection Strategy
The application attempts:
1. `canvas.requestPointerLock({ unadjustedMovement: true })`.
2. If the Promise rejects or throws a `NotSupportedError`, catch the error and fallback immediately to standard `canvas.requestPointerLock()`.
3. Store the boolean `isRawInputActive` in the session telemetry.
4. If raw input is inactive, display an advisory badge to the user:
   > *"OS mouse acceleration could not be bypassed directly by your browser (common on Firefox/Safari). If 'Enhance pointer precision' is enabled in Windows Mouse Settings, measurement confidence may be reduced."*

---

## 3. High Polling Rate Handling (1000 Hz – 8000 Hz)

Gaming mice often poll at 1000 Hz, 4000 Hz, or 8000 Hz.
- Normal React component architecture triggers re-renders on state updates. At 4000 Hz, 4000 React renders per second will instantly freeze the browser thread.
- Browser `mousemove` events are fired at device rate, while `requestAnimationFrame` runs at monitor refresh rate (60 Hz – 360 Hz).
- **Architecture**:
  - The `RawInputEngine` captures events directly on `window`/`document` without React.
  - Samples are appended into a pre-allocated fixed circular buffer (`Float64Array`).
  - The Three.js render loop drains accumulated deltas each frame to rotate the camera.
  - React is updated **only** when a trial ends or when a round transitions.

---

## 4. Focus Loss & Outlier Invalidation
To prevent corrupted data:
- `pointerlockchange` listener detects accidental unlocks (e.g. user pressed ESC or Alt-Tab).
- `visibilitychange` listener pauses testing immediately.
- If pointer lock is lost during an active trial, the trial is automatically discarded and flagged with reason `POINTER_LOCK_LOST`.
- Accidental double clicks or clicks with $\Delta t < 70\text{ ms}$ (impossibly fast human reaction, likely debounce failure) are rejected.
