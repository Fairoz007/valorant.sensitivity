# Sensitivity Mathematics & Aim Telemetry Specifications

**Project:** VALORANT Precision Sensitivity Finder  
**Author:** Lead Engineering & Math Subagent  
**Date:** 2026-10-02  
**Status:** Canonical Reference  

---

## 1. Coordinate Systems & Angular Transforms

### 1.1 In-Game Virtual Camera (Spherical Coordinates)
The aim arena operates in a 3D spherical coordinate system centered at the player's camera position $(0, 0, 0)$.

- Horizontal Rotation: $\theta$ (**Yaw**), measured in degrees ($-\infty < \theta < +\infty$).
- Vertical Rotation: $\phi$ (**Pitch**), measured in degrees (clamped to $[-89.5^\circ, +89.5^\circ]$ to prevent gimbal lock).

The camera forward vector $\mathbf{v}_{\text{cam}}$ in Cartesian 3D coordinates:
$$\begin{aligned}
x &= \sin(\theta \cdot \frac{\pi}{180}) \cos(\phi \cdot \frac{\pi}{180}) \\
y &= \sin(\phi \cdot \frac{\pi}{180}) \\
z &= -\cos(\theta \cdot \frac{\pi}{180}) \cos(\phi \cdot \frac{\pi}{180})
\end{aligned}$$

### 1.2 Mouse Delta to Angular Displacement
Given raw mouse count deltas $(\Delta x, \Delta y)$ received from the Pointer Lock API:

$$\Delta \theta = \Delta x \times S \times \kappa$$
$$\Delta \phi = -\Delta y \times S \times \kappa$$

Where:
- $S$ = Active candidate VALORANT sensitivity
- $\kappa = \text{VALORANT\_YAW} = 0.06996^\circ/\text{count}$
- $\Delta y$ is inverted to conform with standard non-inverted FPS pitch.

### 1.3 Target Representation (Angular Displacement)
Targets are defined strictly by their angular displacement $(\theta_{\text{target}}, \phi_{\text{target}})$ relative to the camera center $(0, 0)$ when spawned, NOT by arbitrary screen pixels.

For a target distance $R$ (e.g. $10\text{ meters}$ in the virtual arena):
$$\mathbf{P}_{\text{target}} = \begin{pmatrix} R \sin(\theta_{\text{target}}) \cos(\phi_{\text{target}}) \\ R \sin(\phi_{\text{target}}) \\ -R \cos(\theta_{\text{target}}) \cos(\phi_{\text{target}}) \end{pmatrix}$$

Target radius is also specified in angular degrees (e.g. standard head radius $\approx 0.75^\circ - 1.2^\circ$).

---

## 2. Telemetry Metrics & Formulations

For every trial, a time-series buffer of samples is recorded:
$$\mathcal{T} = \{ (\tau_i, \Delta x_i, \Delta y_i, \theta_i, \phi_i, v_i) \}_{i=0}^{N}$$
where $\tau_i$ is `performance.now()` in milliseconds.

### 2.1 Reaction Latency ($T_{\text{react}}$)
The time interval from target appearance $\tau_0$ until deliberate mouse movement begins:
$$T_{\text{react}} = \tau_k - \tau_0$$
where $k$ is the first index where cumulative angular displacement exceeds noise floor threshold $\epsilon_{\text{noise}} = 0.15^\circ$ and angular velocity $v_k > 8.0^\circ/\text{s}$.
Reaction latency is isolated from sensitivity scoring because reaction time is predominantly neuromuscular rather than sensitivity-dependent.

### 2.2 Movement Time ($T_{\text{move}}$) and Acquisition Time ($T_{\text{acq}}$)
$$T_{\text{move}} = \tau_{\text{click}} - \tau_k$$
$$T_{\text{acq}} = \tau_{\text{click}} - \tau_0 = T_{\text{react}} + T_{\text{move}}$$

### 2.3 Ideal Distance vs. Path Distance & Path Efficiency
Let $\mathbf{A}_0 = (\theta_0, \phi_0)$ be the crosshair position at movement start, and $\mathbf{A}_{\text{target}} = (\theta_T, \phi_T)$ be the target center.
The ideal angular distance:
$$D_{\text{ideal}} = \sqrt{(\theta_T - \theta_0)^2 + (\phi_T - \phi_0)^2}$$

The cumulative angular path traversed by the crosshair:
$$D_{\text{actual}} = \sum_{i=1}^{M} \sqrt{(\theta_i - \theta_{i-1})^2 + (\phi_i - \phi_{i-1})^2}$$

The **Path Efficiency**:
$$\eta_{\text{path}} = \frac{D_{\text{ideal}}}{\max(D_{\text{actual}}, D_{\text{ideal}})} \in (0, 1]$$

### 2.4 Ballistic Flick, Overshoot, and Undershoot Decomposition
Mouse aiming follows a two-phase motor control model:
1. **Primary Ballistic Movement (Flick)**: Fast, open-loop velocity burst.
2. **Corrective Submovement**: Closed-loop visual feedback adjustment.

Let $\mathbf{u} = \frac{\mathbf{A}_{\text{target}} - \mathbf{A}_0}{\|\mathbf{A}_{\text{target}} - \mathbf{A}_0\|}$ be the unit vector along the primary movement axis.
At any point $i$, the projected progress along the primary axis is:
$$p_i = (\mathbf{A}_i - \mathbf{A}_0) \cdot \mathbf{u}$$

The peak ballistic endpoint is identified at the first local velocity minimum following the primary velocity peak (or where acceleration changes sign after the primary deceleration).

- **Overshoot**:
  If $\max_i(p_i) > D_{\text{ideal}} + r_{\text{target}}$, the player swiped past the target.
  $$\text{Overshoot Magnitude} = \max(0, \max_i(p_i) - D_{\text{ideal}})$$
- **Undershoot**:
  If the primary flick terminates at $p_{\text{flick}} < D_{\text{ideal}} - r_{\text{target}}$ and requires a subsequent secondary push:
  $$\text{Undershoot Magnitude} = \max(0, D_{\text{ideal}} - p_{\text{flick}})$$

### 2.5 Correction Count
A correction is identified when:
1. Direction along the primary axis reverses: $\text{sign}(v_{\parallel, i}) \neq \text{sign}(v_{\parallel, i-1})$, AND
2. The reversal excursion exceeds sensor noise threshold ($\Delta \theta > 0.12^\circ$), AND
3. Velocity drops and re-accelerates.

### 2.6 Endpoint Precision & Angular Dispersion
For $K$ trials at a given candidate sensitivity, endpoint errors $e_k = \|\mathbf{A}_{\text{click}, k} - \mathbf{A}_{\text{target}, k}\|$:
$$\text{Radial RMS Error} = \sqrt{\frac{1}{K}\sum_{k=1}^K e_k^2}$$
$$\text{Median Absolute Deviation (MAD)} = \text{median}(|e_k - \text{median}(e)|)$$

---

## 3. Scoring Function

A candidate sensitivity $S$ is evaluated across five normalized component dimensions $[0, 100]$:

$$Score(S) = w_{\text{prec}} C_{\text{prec}} + w_{\text{eff}} C_{\text{eff}} + w_{\text{cons}} C_{\text{cons}} + w_{\text{speed}} C_{\text{speed}} + w_{\text{ctrl}} C_{\text{ctrl}} - P_{\text{penalties}}$$

### Baseline Weights:
- $w_{\text{prec}} = 0.30$ (Micro-precision & Hit Accuracy)
- $w_{\text{eff}} = 0.20$ (Path Efficiency)
- $w_{\text{cons}} = 0.25$ (Consistency / Low Dispersion)
- $w_{\text{speed}} = 0.15$ (Ballistic Movement Time)
- $w_{\text{ctrl}} = 0.10$ (Tracking / Smoothness)

### Penalties $P_{\text{penalties}}$:
- Systematic Overshoot Penalty: If $>35\%$ of trials exhibit overshoot, scale penalty $\propto \text{overshoot rate} \times \text{mean overshoot magnitude}$.
- Excessive Correction Penalty: If average correction count $> 2.2$ per flick.
- Severe Undershoot Stagnation: Repeated large undershoots requiring 3+ corrective sub-glides.
