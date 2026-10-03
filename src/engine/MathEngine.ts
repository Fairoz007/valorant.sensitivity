import { VALORANT_YAW_DEG_PER_COUNT } from '../config/constants';

// Re-export so existing importers from MathEngine continue to work
export { VALORANT_YAW_DEG_PER_COUNT };

export function calculateEDPI(dpi: number, sens: number): number {
  return dpi * sens;
}

export function calculateCmPer360(dpi: number, sens: number): number {
  return (360 * 2.54) / (dpi * sens * VALORANT_YAW_DEG_PER_COUNT);
}

export function countsToDegrees(counts: number, sens: number): number {
  return counts * sens * VALORANT_YAW_DEG_PER_COUNT;
}

export function clampPitch(pitch: number): number {
  return Math.max(-89.5, Math.min(89.5, pitch));
}

export function yawPitchToCartesian(yaw: number, pitch: number, radius: number = 1): { x: number; y: number; z: number } {
  const yawRad = yaw * (Math.PI / 180);
  const pitchRad = pitch * (Math.PI / 180);
  const x = radius * Math.sin(yawRad) * Math.cos(pitchRad);
  const y = radius * Math.sin(pitchRad);
  const z = -radius * Math.cos(yawRad) * Math.cos(pitchRad);
  return { x, y, z };
}

export function cartesianToYawPitch(x: number, y: number, z: number): { yaw: number; pitch: number } {
  const radius = Math.sqrt(x * x + y * y + z * z);
  if (radius === 0) return { yaw: 0, pitch: 0 };
  
  const pitchRad = Math.asin(y / radius);
  const yawRad = Math.atan2(x, -z);
  
  return {
    yaw: yawRad * (180 / Math.PI),
    pitch: pitchRad * (180 / Math.PI)
  };
}

export function angularDistance(yaw1: number, pitch1: number, yaw2: number, pitch2: number): number {
  const y1 = yaw1 * (Math.PI / 180);
  const p1 = pitch1 * (Math.PI / 180);
  const y2 = yaw2 * (Math.PI / 180);
  const p2 = pitch2 * (Math.PI / 180);

  const deltaYaw = y2 - y1;
  const deltaPitch = p2 - p1;

  const a = Math.pow(Math.sin(deltaPitch / 2), 2) + 
            Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin(deltaYaw / 2), 2);
  const clamped = Math.max(0, Math.min(1, a));
  const c = 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  
  return c * (180 / Math.PI);
}

export function signedYawDelta(yaw: number, origin: number): number {
  return ((yaw - origin + 180) % 360 + 360) % 360 - 180;
}
