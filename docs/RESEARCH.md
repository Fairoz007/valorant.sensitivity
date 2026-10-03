# VALORANT Mouse Sensitivity & Biomechanical Input Research

**Project:** VALORANT Precision Sensitivity Finder  
**Author:** Lead Engineering & Research Subagent  
**Date:** 2026-10-02  
**Status:** Canonical Reference  

---

## 1. Executive Summary

Determining optimal mouse sensitivity in a tactical shooter like VALORANT cannot be solved by simply copying professional player averages. Aim in VALORANT is an asymmetric motor-control task requiring:
1. **Micro-Precision (1°–4°)**: Crosshair placement corrections, pixel-level adjustments for headshots.
2. **Medium Flicks (8°–20°)**: Common clearing angles, target acquisition across doorways or boxes.
3. **Large Angle Acquisition (25°–60°+)**: Checking corners, reactive turns against flashes or flankers.
4. **Target Switching**: Multi-target target re-acquisition without overshooting or settling oscillations.
5. **Dynamic Control / Micro-Tracking**: Smooth tracking during counter-strafing and target movement.

This research document establishes the mathematical foundations, empirical constants, hardware factors, and browser constraints required to build a scientific browser-based sensitivity optimization arena.

---

## 2. Mathematical Foundations & Empirical Constants

### 2.1 Counts Per Inch (CPI) / DPI
Mouse optical sensors record movement in discrete physical "counts" as the sensor passes over surface features. While commonly referred to as "DPI" (dots per inch), the technically precise term is **CPI** (counts per inch). For every inch of physical mouse displacement, the sensor emits approximately $N$ counts along the $X$ and $Y$ axes.

### 2.2 VALORANT Yaw Constant
VALORANT is built upon a modified Unreal Engine 4 architecture. The internal camera rotation system converts incoming raw mouse counts into angular degrees of yaw (horizontal) and pitch (vertical).

In VALORANT:
$$\text{Degrees Rotated} = \text{Raw Counts} \times \text{Sensitivity} \times \text{VALORANT\_YAW}$$

The standard documented conversion factor:
$$\text{VALORANT\_YAW} = 0.06996^\circ \text{ per count at sensitivity } 1.0$$

#### Verification & Origin:
- **Source Engine Equivalence**: Counter-Strike / Source Engine uses a standard yaw of $0.022^\circ/\text{count}$.
- Riot Games designed VALORANT's sensitivity scale with an exact conversion ratio of:
  $$\text{VALORANT Sensitivity} = \frac{\text{Source / CS:GO Sensitivity}}{3.18181818...} = \frac{\text{Source Sensitivity}}{3.18\overline{18}}$$
- Therefore:
  $$\text{Yaw}_{\text{VAL}} = 0.022^\circ \times 3.18181818... = 0.0699999...^\circ \approx 0.07^\circ$$
- More specifically, empirical precision measurements using KovaaK's Sensitivity Matcher, engine packet telemetry, and community measurement benchmarks establish:
  $$\text{VALORANT\_YAW} = 0.06996^\circ$$
- **Configuration Directive**: In our application, this constant is isolated in `src/config/constants.ts` with explicit source documentation.

### 2.3 Effective DPI (eDPI)
eDPI normalizes sensitivity across different hardware DPI settings:
$$\text{eDPI} = \text{DPI} \times \text{VALORANT Sensitivity}$$

*Example:* $800\text{ DPI} \times 0.30 = 240\text{ eDPI}$.

### 2.4 Physical Distance: cm/360
$\text{cm/360}$ represents the physical distance (in centimeters) the mouse must travel across the mousepad to complete a full $360^\circ$ in-game rotation.

#### Derivation:
1. Total counts for $360^\circ$:
   $$\text{Counts}_{360} = \frac{360^\circ}{\text{Sensitivity} \times \text{VALORANT\_YAW}}$$
2. Physical distance in inches:
   $$\text{Inches}_{360} = \frac{\text{Counts}_{360}}{\text{DPI}} = \frac{360}{\text{DPI} \times \text{Sensitivity} \times \text{VALORANT\_YAW}}$$
3. Conversion to centimeters ($1\text{ inch} = 2.54\text{ cm}$):
   $$\text{cm/360} = \frac{360 \times 2.54}{\text{DPI} \times \text{Sensitivity} \times \text{VALORANT\_YAW}} = \frac{914.4}{\text{DPI} \times \text{Sensitivity} \times 0.06996}$$

$$\text{cm/360} \approx \frac{13070.3259}{\text{DPI} \times \text{Sensitivity}} = \frac{13070.3259}{\text{eDPI}}$$

*Example:* At 240 eDPI:
$$\text{cm/360} = \frac{13070.3259}{240} \approx 54.46\text{ cm}$$

---

## 3. Professional Tactical-FPS Sensitivity Distributions

To establish initial search boundaries and sanity checks (without biasing the recommendation):

| Percentile / Tier | eDPI Range | cm/360 Range | Typical Aiming Style |
|:---|:---|:---|:---|
| **Ultra-Low (<5th percentile)** | $120 - 180$ | $72 - 108\text{ cm}$ | Pure Arm / Large Deskpad |
| **Low-Normal (25th percentile)** | $180 - 230$ | $57 - 72\text{ cm}$ | Arm with Wrist Micro-adjust |
| **Median VCT Pro (50th percentile)** | $\approx 250$ | $\approx 52\text{ cm}$ | Hybrid Arm/Wrist |
| **High-Normal (75th percentile)** | $270 - 340$ | $38 - 48\text{ cm}$ | Hybrid / Wrist Heavy |
| **High (>95th percentile)** | $360 - 500+$ | $26 - 36\text{ cm}$ | Pure Wrist / High Sensitivity |

### Guardrails:
- The system should allow search ranges from $100\text{ eDPI}$ ($130\text{ cm/360}$) up to $600\text{ eDPI}$ ($21.8\text{ cm/360}$).
- Values outside $80 - 800\text{ eDPI}$ flag a sanity warning (e.g. asking the user to recheck DPI or in-game sensitivity).

---

## 4. Hardware & Biomechanical Factors

### 4.1 Sensor CPI Deviation
Sensory tests from independent hardware testing labs (e.g., TechPowerUp, RTINGS, Blur Busters) demonstrate that optical sensors (PixArt 3370, 3395, Focus Pro 30K/35K, HERO 25K) have real-world CPI deviations of $\pm 1\%$ to $\pm 6\%$ depending on:
- SROM firmware calibration
- Sensor height off the surface (LOD)
- Mousepad weave structure and reflectivity
Because true physical CPI deviates from nominal CPI, our application calculates recommendations relative to the user's current environment.

### 4.2 Polling Rates (125 Hz to 8000 Hz)
- Modern gaming mice poll at $1000\text{ Hz}$ ($1\text{ ms}$ interval), $2000\text{ Hz}$ ($0.5\text{ ms}$), $4000\text{ Hz}$ ($0.25\text{ ms}$), and $8000\text{ Hz}$ ($0.125\text{ ms}$).
- **Browser Hazard**: A browser dispatching 8,000 DOM `mousemove` events per second will trigger event starvation and main-thread GC pauses if event handlers perform allocations or trigger React state updates.
- **Architectural Solution**: The high-frequency input engine must process events in an unallocated ring buffer / typed array structure and decouple React state updates completely from input sampling.

### 4.3 Mousepad Usable Width Constraint
A player's usable mousepad surface width sets a physical upper bound on achievable rotation without lifting the mouse:
$$\text{Max Turn Angle at Usable Width } W\text{ cm} = \frac{W}{\text{cm/360}} \times 360^\circ$$
If a player has a $30\text{ cm}$ mousepad, an eDPI of 150 ($87\text{ cm/360}$) permits only a $124^\circ$ swipe before lifting—insufficient to clear a $180^\circ$ backstab. The recommendation engine should incorporate usable mousepad width as an optional constraint boundary.

---

## 5. Browser Pointer Lock & Raw Input Realities

### 5.1 The `unadjustedMovement` Specification
In standard OS environments (Windows, macOS), mouse pointer acceleration algorithms (e.g., Windows "Enhance Pointer Precision") alter mouse counts dynamically based on hand velocity. In a competitive FPS, acceleration destroys muscle memory unless specifically modeled.

The W3C Pointer Lock API Level 2 introduced:
```javascript
canvas.requestPointerLock({
  unadjustedMovement: true
});
```
- **Windows / Chromium (Chrome, Edge, Brave)**: Maps directly to `WM_INPUT` (Raw Input), bypassing Windows Pointer Ballistics.
- **Firefox / Safari**: Historically rejects the dictionary option or falls back silently to standard pointer lock.
- **Application Requirement**: Must query capabilities, test whether unadjusted movement was accepted, and report confidence transparently.

---

## 6. Summary of Constants

```typescript
export const VALORANT_YAW_DEG_PER_COUNT = 0.06996; // deg/count @ sens 1.0
export const INCHES_TO_CM = 2.54;
export const FULL_ROTATION_DEG = 360.0;

// Conversion formula:
// cm360 = (360 * 2.54) / (DPI * sensitivity * VALORANT_YAW_DEG_PER_COUNT)
```
