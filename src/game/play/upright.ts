/** Chassis recovery. Local up is +Y. A roof on the ground reads negative. */

export const ROOF_WAIT = 1;

/** World Y of the chassis up axis. 1 is wheels-down, -1 is on the roof. */
export function chassisUp(qx: number, qy: number, qz: number, qw: number): number {
  const scale = qx * qx + qy * qy + qz * qz + qw * qw || 1;
  return (1 - 2 * (qx * qx + qz * qz)) / scale;
}

/** Yaw that keeps the nose when pitch and roll are cleared. */
export function headingYaw(qx: number, qy: number, qz: number, qw: number): number {
  const fx = 2 * (qx * qz + qy * qw);
  const fz = 1 - 2 * (qx * qx + qy * qy);
  if (fx * fx + fz * fz < 1e-6) return 2 * Math.atan2(qy, qw);
  return Math.atan2(fx, fz);
}

/** Seconds already spent on the roof. An upright chassis starts the wait over. */
export function roofTime(spent: number, up: number, dt: number): number {
  if (up < 0) return spent + dt;
  return 0;
}

export function readyToFlip(spent: number): boolean {
  return spent >= ROOF_WAIT;
}
