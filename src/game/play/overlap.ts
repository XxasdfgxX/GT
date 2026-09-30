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

/** How long a bump keeps a body on the ground before it stands. */
export const TRIP_SECONDS = 0.55;

/** Horizontal speed that counts as running into something. */
export const BUMP_SPEED = 2.2;

/** Gap kept between two standing bodies. */
export const BODY_REACH = 0.8;

export function shouldTrip(speed: number, alreadyDown: number): boolean {
  return speed > BUMP_SPEED && alreadyDown <= 0;
}
