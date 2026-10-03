import type { TargetDirection } from '../types';

export type ScenarioType = 'micro' | 'medium' | 'large' | 'switching' | 'tracking';

export interface TargetDef {
  id: number | string;
  scenario?: ScenarioType;
  yaw: number;
  pitch: number;
  radius: number;
  direction?: TargetDirection;
  sequenceId?: number;
  velocity?: number; // deg/s
  trajectory?: { yaw: number; pitch: number }; // normalized vector
}

export function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInRange(prng: () => number, min: number, max: number): number {
  return min + prng() * (max - min);
}

function randomDirection(prng: () => number): { yaw: number; pitch: number } {
  const angle = prng() * 2 * Math.PI;
  return { yaw: Math.cos(angle), pitch: Math.sin(angle) };
}

/**
 * Generate a specific directional target displacement
 */
function getDirectionVector(dir: TargetDirection): { yaw: number; pitch: number } {
  switch (dir) {
    case 'RIGHT':
      return { yaw: 1, pitch: 0 };
    case 'LEFT':
      return { yaw: -1, pitch: 0 };
    case 'UP':
      return { yaw: 0, pitch: 1 };
    case 'DOWN':
      return { yaw: 0, pitch: -1 };
    case 'UP_RIGHT':
      return { yaw: 0.7071, pitch: 0.7071 };
    case 'UP_LEFT':
      return { yaw: -0.7071, pitch: 0.7071 };
    case 'DOWN_RIGHT':
      return { yaw: 0.7071, pitch: -0.7071 };
    case 'DOWN_LEFT':
      return { yaw: -0.7071, pitch: -0.7071 };
  }
}

/**
 * Statistically Equivalent Candidate Battery (Task 42)
 * Ensures every tested sensitivity candidate receives identical difficulty,
 * identical directional balance (LEFT, RIGHT, UP, DOWN, DIAGONALS),
 * and balanced scenario mix (Micro, Medium, Large, Switching, Tracking).
 */
export function generateBalancedCandidateBattery(seed: number): TargetDef[] {
  const prng = mulberry32(seed);
  const targets: TargetDef[] = [];
  let id = 0;

  // 1. Micro Precision Targets (1°–4°) - 3 targets (Left, Right, Vertical)
  const microDirs: TargetDirection[] = ['LEFT', 'RIGHT', 'UP'];
  for (const dir of microDirs) {
    const disp = randomInRange(prng, 1.5, 3.8);
    const vec = getDirectionVector(dir);
    // Add micro jitter to direction vector
    const jitter = (prng() - 0.5) * 0.15;
    targets.push({
      id: `micro_${id++}`,
      scenario: 'micro',
      yaw: vec.yaw * disp + jitter,
      pitch: vec.pitch * disp + jitter,
      radius: 0.85,
      direction: dir,
    });
  }

  // 2. Medium Flick Targets (8°–20°) - 4 targets (Left, Right, Up/Down, Diagonal)
  const mediumDirs: TargetDirection[] = ['LEFT', 'RIGHT', 'UP', 'DOWN_RIGHT'];
  for (const dir of mediumDirs) {
    const disp = randomInRange(prng, 9.0, 18.0);
    const vec = getDirectionVector(dir);
    const jitter = (prng() - 0.5) * 0.3;
    targets.push({
      id: `medium_${id++}`,
      scenario: 'medium',
      yaw: vec.yaw * disp + jitter,
      pitch: vec.pitch * disp + jitter,
      radius: 1.25,
      direction: dir,
    });
  }

  // 3. Large Flick Targets (25°–55°) - 2 targets (Left & Right for arm travel & centering check)
  const largeDirs: TargetDirection[] = ['LEFT', 'RIGHT'];
  for (const dir of largeDirs) {
    const disp = randomInRange(prng, 28.0, 48.0);
    const vec = getDirectionVector(dir);
    targets.push({
      id: `large_${id++}`,
      scenario: 'large',
      yaw: vec.yaw * disp,
      pitch: vec.pitch * disp * 0.3,
      radius: 1.6,
      direction: dir,
    });
  }

  // 4. Target Switching Sequence (Task 38) - 1 multi-step switch
  const switchDisps = [11.0, 14.0, 10.0];
  const switchDirs: TargetDirection[] = ['LEFT', 'UP_RIGHT', 'DOWN_LEFT'];
  for (let s = 0; s < 3; s++) {
    const vec = getDirectionVector(switchDirs[s]);
    targets.push({
      id: `switch_${id++}`,
      scenario: 'switching',
      yaw: vec.yaw * switchDisps[s],
      pitch: vec.pitch * switchDisps[s] * 0.6,
      radius: 1.2,
      direction: switchDirs[s],
      sequenceId: s,
    });
  }

  // 5. Short Moving Target Tracking (Task 39)
  targets.push({
    id: `track_${id++}`,
    scenario: 'tracking',
    yaw: 6.0,
    pitch: 2.0,
    radius: 1.3,
    direction: 'RIGHT',
    velocity: 3.5, // 3.5 deg/s
    trajectory: { yaw: 1.0, pitch: 0.2 },
  });

  return targets;
}

export function generateBatteryTargets(
  seed: number,
  scenario: ScenarioType,
  count: number
): TargetDef[] {
  const prng = mulberry32(seed);
  const targets: TargetDef[] = [];

  for (let i = 0; i < count; i++) {
    if (scenario === 'switching') {
      const numTargets = Math.floor(randomInRange(prng, 3, 5.99));
      for (let j = 0; j < numTargets; j++) {
        const displacement = randomInRange(prng, 8.0, 20.0);
        const dir = randomDirection(prng);
        targets.push({
          id: i * 100 + j,
          scenario: 'switching',
          yaw: dir.yaw * displacement,
          pitch: dir.pitch * displacement,
          radius: 1.25,
          sequenceId: j,
        });
      }
    } else {
      let displacement = 0;
      let radius = 1.0;
      if (scenario === 'micro') {
        displacement = randomInRange(prng, 1.0, 4.0);
        radius = 0.85;
      } else if (scenario === 'medium') {
        displacement = randomInRange(prng, 8.0, 20.0);
        radius = 1.25;
      } else if (scenario === 'large') {
        displacement = randomInRange(prng, 25.0, 55.0);
        radius = 1.6;
      } else if (scenario === 'tracking') {
        displacement = randomInRange(prng, 5.0, 15.0);
        radius = 1.25;
      }

      const dir = randomDirection(prng);
      const yaw = dir.yaw * displacement;
      const pitch = dir.pitch * displacement;

      const target: TargetDef = {
        id: i,
        scenario,
        yaw,
        pitch,
        radius,
      };

      if (scenario === 'tracking') {
        target.velocity = randomInRange(prng, 2.5, 5.0);
        target.trajectory = randomDirection(prng);
      }

      targets.push(target);
    }
  }

  return targets;
}
