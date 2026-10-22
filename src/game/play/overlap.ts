/** Flat overlap used to keep bodies out of boxes and out of each other. */

/** A circle meets a yawed box on the ground. Yaw 0 keeps the box's depth on +Z. */
export function circleHitsBox(
  px: number,
  pz: number,
  radius: number,
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  yaw: number,
): boolean {
  const dx = px - cx;
  const dz = pz - cz;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) <= hx + radius && Math.abs(localZ) <= hz + radius;
}

export function circlesOverlap(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  reach: number,
): boolean {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz < reach * reach;
}

/**
 * True when `to` is inside the reach and is not stepping away from a point
 * that was already inside. A body that is buried can walk out.
 */
export function pinsCircle(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  otherX: number,
  otherZ: number,
  reach: number,
): boolean {
  if (!circlesOverlap(toX, toZ, otherX, otherZ, reach)) return false;
  if (!circlesOverlap(fromX, fromZ, otherX, otherZ, reach)) return true;
  const before = (fromX - otherX) ** 2 + (fromZ - otherZ) ** 2;
  const after = (toX - otherX) ** 2 + (toZ - otherZ) ** 2;
  return after <= before + 1e-4;
}

/** Shallowest overlap of a circle in a yawed box. Zero when they are clear. */
export function circleBoxDepth(
  px: number,
  pz: number,
  radius: number,
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  yaw: number,
): number {
  const dx = px - cx;
  const dz = pz - cz;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const localX = Math.abs(dx * cos - dz * sin);
  const localZ = Math.abs(dx * sin + dz * cos);
  const overX = hx + radius - localX;
  const overZ = hz + radius - localZ;
  if (overX <= 0 || overZ <= 0) return 0;
  return Math.min(overX, overZ);
}

export interface PlanePush {
  x: number;
  z: number;
  depth: number;
}

const clearPush: PlanePush = { x: 0, z: 0, depth: 0 };

/** Shortest ground push that walks a circle out of a yawed box. */
export function circleBoxExit(
  px: number,
  pz: number,
  radius: number,
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  yaw: number,
): PlanePush {
  const dx = px - cx;
  const dz = pz - cz;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const overX = hx + radius - Math.abs(localX);
  const overZ = hz + radius - Math.abs(localZ);
  if (overX <= 0 || overZ <= 0) return clearPush;
  const depth = Math.min(overX, overZ);
  const pushX = overX < overZ ? (localX >= 0 ? 1 : -1) * overX : 0;
  const pushZ = overX < overZ ? 0 : (localZ >= 0 ? 1 : -1) * overZ;
  return {
    x: pushX * cos + pushZ * sin,
    z: -pushX * sin + pushZ * cos,
    depth,
  };
}

/** True when the circle sinks farther into the box than it was. */
export function sinksDeeper(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  yaw: number,
  radius: number,
): boolean {
  const next = circleBoxDepth(toX, toZ, radius, cx, cz, hx, hz, yaw);
  if (next <= 0) return false;
  const prev = circleBoxDepth(fromX, fromZ, radius, cx, cz, hx, hz, yaw);
  return next > prev + 0.001;
}

/** How long a bump keeps a body on the ground before it stands. */
export const TRIP_SECONDS = 0.55;

/** Horizontal speed that counts as running into something. */
export const BUMP_SPEED = 2.2;

/** Gap kept between two standing bodies. */
export const BODY_REACH = 0.8;

export function shouldTrip(speed: number, alreadyDown: number): boolean {
  return speed > BUMP_SPEED && alreadyDown <= 0;
}
