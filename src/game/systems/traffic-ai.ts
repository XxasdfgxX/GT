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

export function lightOpen(edgeDx: number, edgeDz: number, kind: string, phase: number): boolean {
  const northSouth = Math.abs(edgeDz) >= Math.abs(edgeDx);
  if (kind === 'street') return phase === (northSouth ? 0 : 1);
  return phase === (northSouth ? 0 : 1);
}

/** Streets wait while an avenue car is close to the same node. */
export function mustYield(kind: string, avenueNear: boolean): boolean {
  return kind === 'street' && avenueNear;
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

export function followSpeed(limit: number, gap: number, top: number): number {
  const cap = Math.min(limit, top);
  if (gap < 6) return 0;
  if (gap < 14) return cap * ((gap - 6) / 8);
  return cap;
}
