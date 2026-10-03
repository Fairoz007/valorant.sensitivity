/**
 * VALORANT Sensitivity & Physical Aim Constants
 * ═══════════════════════════════════════════════════════════
 * AUTHORITATIVE SOURCE — This is the ONLY definition of the yaw constant.
 * All other files MUST import from here. Never duplicate this value.
 */

// One authoritative conversion matching the requested VALORANT approximation.
// Camera rotation uses counts × sensitivity; DPI is reporting only.
export const VALORANT_YAW_DEG_PER_COUNT = 0.07;

export const INCHES_TO_CM = 2.54;
export const FULL_ROTATION_DEG = 360.0;

// Safe search boundaries for tactical FPS
export const MIN_SENS_BOUND = 0.05;
export const MAX_SENS_BOUND = 2.50;
export const DEFAULT_DPI = 800;
export const DEFAULT_SENS = 0.30;

// Minimum trial limits
export const MIN_TRIALS_PER_CANDIDATE = 8;
export const CONFIRMATION_TRIALS_PER_CANDIDATE = 10;

// Scoring Component Weights (Hypothesis starting weights documented in spec)
export const SCORING_WEIGHTS = {
  precision: 0.30,       // Micro-accuracy, endpoint dispersion
  consistency: 0.25,     // Low variance across trials
  efficiency: 0.20,      // Path efficiency (ideal distance / actual distance)
  speed: 0.15,           // Ballistic movement time
  control: 0.10,         // Tracking & smoothness
};

// Target angular sizes (in visual degrees)
export const TARGET_ANGULAR_SIZES = {
  micro: 0.85,    // Head-sized at long distance (~1.0° - 4.0° displacement)
  medium: 1.25,   // Standard head at medium distance (~8.0° - 20.0° displacement)
  large: 1.60,    // Head/torso at wide angle (~25.0° - 55.0° displacement)
  switching: 1.20,// Multi-target sequence
  tracking: 1.40, // Moving target
};

// Telemetry thresholds
export const NOISE_FLOOR_DEG = 0.12;          // Below this is sensor noise
export const VELOCITY_START_THRESHOLD = 6.0;  // deg/s to register deliberate movement
export const CORRECTION_MIN_EXCURSION = 0.15; // deg reversal to register as deliberate correction
export const MIN_HUMAN_REACTION_MS = 65;      // Below this is accidental double-click / debounce error
