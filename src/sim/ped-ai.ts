/** Pedestrian gates. The state machine in the system calls these. */

export const PedState = {
  Idle: 0,
  Walk: 1,
  Wait: 2,
  Cross: 3,
  Flee: 4,
  Fight: 5,
  Down: 6,
  Trip: 7,
} as const;

export const LIGHT_DAMAGE = 2;
export const HEAVY_DAMAGE = 3;
export const COUNTER_DAMAGE = 1;
export const HURT_SECONDS = 5;

export function punchProfile(heavy: boolean): {
  damage: number;
  duration: number;
  hitDelay: number;
} {
  if (heavy) return { damage: HEAVY_DAMAGE, duration: 0.92, hitDelay: 0.34 };
  return { damage: LIGHT_DAMAGE, duration: 0.42, hitDelay: 0.14 };
}

export function applyDamage(health: number, amount: number): number {
  return Math.max(0, health - amount);
}

export function hurtRemaining(timer: number, dt: number): number {
  return Math.max(0, timer - dt);
}

export function healthBarVisible(timer: number): boolean {
  return timer > 0;
}

export function shouldFlee(carSpeed: number, distance: number, touching: boolean): boolean {
  if (touching && carSpeed > 2) return true;
  return carSpeed > 7 && distance < 8;
}

export function canCross(trafficNear: boolean): boolean {
  return !trafficNear;
}

/** True when a standing punch reaches someone. Overlap always hits; otherwise they must be in front. */
export function punchHits(
  px: number,
  pz: number,
  facing: number,
  tx: number,
  tz: number,
  reach: number,
): boolean {
  const dx = tx - px;
  const dz = tz - pz;
  const distance = Math.hypot(dx, dz);
  if (distance > reach || distance < 1e-4) return false;
  if (distance < 1) return true;
  const forwardX = -Math.sin(facing);
  const forwardZ = -Math.cos(facing);
  return (dx * forwardX + dz * forwardZ) / distance > 0.15;
}
