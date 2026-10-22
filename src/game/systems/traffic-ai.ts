/** Lane choice, lights, and following distance. No allocations. */

export function lanesInDirection(lanes: number, oneWay: boolean): number {
  if (oneWay) return Math.max(1, lanes);
  return Math.max(1, Math.floor(lanes / 2));
}

/** Signed meters to the right of the a→b centerline. */
export function laneOffset(
  width: number,
  lanes: number,
  lane: number,
  dir: number,
  oneWay: boolean,
): number {
  const laneWidth = width / Math.max(1, lanes);
  const used = Math.min(lane, lanesInDirection(lanes, oneWay) - 1);
  const fromCenter = width / 2 - laneWidth * (used + 0.5);
  return dir === 0 ? fromCenter : -fromCenter;
}

/** Seconds each light phase lasts. */
export const LIGHT_SECONDS = 6;

/** 0 lets north-south roads through, 1 east-west. Solo and the room server share the clock rule. */
export function lightPhase(seconds: number): number {
  return Math.floor(seconds / LIGHT_SECONDS) % 2;
}

export function lightOpen(edgeDx: number, edgeDz: number, kind: string, phase: number): boolean {
  const northSouth = Math.abs(edgeDz) >= Math.abs(edgeDx);
  if (kind === 'street') return phase === (northSouth ? 0 : 1);
  return phase === (northSouth ? 0 : 1);
}

/** Streets wait while an avenue car is close to the same node. */
export function mustYield(kind: string, avenueNear: boolean): boolean {
  return kind === 'street' && avenueNear;
}

/**
 * Yaw change for a stolen car. Left is negative steer. steerSign matches the
 * physics sedan, and reverse flips it so the car still backs the way you press.
 */
export function drivenYawRate(steer: number, speed: number, steerSign: number): number {
  const reversing = speed < -0.3 ? -1 : 1;
  return steer * steerSign * reversing;
}

/** Ground-plane overlap of two boxes. Yaw 0 faces +Z, matching quatFromYaw. */
export function carBoxesOverlap(
  ax: number,
  az: number,
  ayaw: number,
  ahx: number,
  ahz: number,
  bx: number,
  bz: number,
  byaw: number,
  bhx: number,
  bhz: number,
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const reach = ahx + ahz + bhx + bhz;
  if (dx * dx + dz * dz > reach * reach) return false;
  return (
    !axisClear(dx, dz, Math.sin(ayaw), Math.cos(ayaw), ahx, ahz, ayaw, bhx, bhz, byaw) &&
    !axisClear(dx, dz, Math.cos(ayaw), -Math.sin(ayaw), ahx, ahz, ayaw, bhx, bhz, byaw) &&
    !axisClear(dx, dz, Math.sin(byaw), Math.cos(byaw), ahx, ahz, ayaw, bhx, bhz, byaw) &&
    !axisClear(dx, dz, Math.cos(byaw), -Math.sin(byaw), ahx, ahz, ayaw, bhx, bhz, byaw)
  );
}

function axisClear(
  dx: number,
  dz: number,
  axisX: number,
  axisZ: number,
  ahx: number,
  ahz: number,
  ayaw: number,
  bhx: number,
  bhz: number,
  byaw: number,
): boolean {
  const dist = Math.abs(dx * axisX + dz * axisZ);
  return (
    dist >
    projectedRadius(ahx, ahz, ayaw, axisX, axisZ) + projectedRadius(bhx, bhz, byaw, axisX, axisZ)
  );
}

function projectedRadius(
  hx: number,
  hz: number,
  yaw: number,
  axisX: number,
  axisZ: number,
): number {
  const forward = Math.abs(Math.sin(yaw) * axisX + Math.cos(yaw) * axisZ);
  const right = Math.abs(Math.cos(yaw) * axisX - Math.sin(yaw) * axisZ);
  return hx * right + hz * forward;
}

export interface BoxPush {
  x: number;
  z: number;
  depth: number;
}

const noPush: BoxPush = { x: 0, z: 0, depth: 0 };

/** Shortest push that walks box A out of box B. Depth is zero when they are clear. */
export function boxExit(
  ax: number,
  az: number,
  ayaw: number,
  ahx: number,
  ahz: number,
  bx: number,
  bz: number,
  byaw: number,
  bhx: number,
  bhz: number,
): BoxPush {
  const dx = bx - ax;
  const dz = bz - az;
  const reach = ahx + ahz + bhx + bhz;
  if (dx * dx + dz * dz > reach * reach) return noPush;
  const axes: readonly (readonly [number, number])[] = [
    [Math.sin(ayaw), Math.cos(ayaw)],
    [Math.cos(ayaw), -Math.sin(ayaw)],
    [Math.sin(byaw), Math.cos(byaw)],
    [Math.cos(byaw), -Math.sin(byaw)],
  ];
  let best = Infinity;
  let bestX = 0;
  let bestZ = 0;
  for (const [axisX, axisZ] of axes) {
    const signed = dx * axisX + dz * axisZ;
    const limit =
      projectedRadius(ahx, ahz, ayaw, axisX, axisZ) + projectedRadius(bhx, bhz, byaw, axisX, axisZ);
    const overlap = limit - Math.abs(signed);
    if (overlap <= 0) return noPush;
    if (overlap < best) {
      best = overlap;
      const sign = signed > 0 ? -1 : 1;
      bestX = axisX * sign * overlap;
      bestZ = axisZ * sign * overlap;
    }
  }
  return { x: bestX, z: bestZ, depth: best };
}

/** Steps a spawn forward so a later car does not sit on one that just appeared. */
export function steppedAlong(base: number, length: number, attempt: number, gap: number): number {
  if (length <= 0) return 0;
  const shift = base + attempt * gap;
  return ((shift % length) + length) % length;
}

export function followSpeed(limit: number, gap: number, top: number): number {
  const cap = Math.min(limit, top);
  if (gap < 6) return 0;
  if (gap < 14) return cap * ((gap - 6) / 8);
  return cap;
}

const YIELD_BODY = 2.4;
const YIELD_STOP = 7;
const YIELD_LOOK = 18;
const PANIC_BRAKE = 28;

/**
 * Speed cap when a person is in the lane ahead.
 * Full stop up close, ease off farther out, ignore sidewalk and anyone behind.
 */
export function yieldToPedestrian(
  carX: number,
  carZ: number,
  forwardX: number,
  forwardZ: number,
  personX: number,
  personZ: number,
  halfWidth: number,
  limit: number,
): number {
  const dx = personX - carX;
  const dz = personZ - carZ;
  const ahead = dx * forwardX + dz * forwardZ;
  const lateral = Math.abs(dx * forwardZ - dz * forwardX);
  if (ahead < -0.3) return limit;
  if (dx * dx + dz * dz < YIELD_BODY * YIELD_BODY) return 0;
  if (ahead > YIELD_LOOK) return limit;
  if (lateral > halfWidth + 0.7) return limit;
  if (ahead < YIELD_STOP) return 0;
  return Math.min(limit, limit * ((ahead - YIELD_STOP) / (YIELD_LOOK - YIELD_STOP)));
}

/** Damage from a driven car. A crawl is a bump; a fast hit can empty a health bar. */
export function carImpactDamage(speed: number): number {
  const pace = Math.abs(speed);
  if (pace < 3) return 0;
  return Math.min(10, Math.max(1, Math.round(pace * 0.5)));
}

/** Ease toward a cap, or slam the brakes when a person is blocking the lane. */
export function approachSpeed(speed: number, limit: number, dt: number, panic: boolean): number {
  if (panic) return Math.max(0, speed - PANIC_BRAKE * dt);
  return Math.max(0, speed + Math.max(-18, Math.min(8, limit - speed)) * dt * 2);
}
