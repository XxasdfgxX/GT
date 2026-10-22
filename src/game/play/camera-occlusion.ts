/** Keeps the orbit camera on the player's side of a wall. */

import type { BoxCollider } from '../../content/map/batch';
import { tallBoxesNear } from '../../sim/collider-grid';

/**
 * Share of the segment from the pivot to the camera, 0 to 1, that is clear of tall boxes.
 * A box the pivot already stands in is ignored, so a player hugging a wall keeps a view.
 */
export function clearShare(
  boxes: readonly BoxCollider[],
  px: number,
  py: number,
  pz: number,
  cx: number,
  cy: number,
  cz: number,
): number {
  const dx = cx - px;
  const dy = cy - py;
  const dz = cz - pz;
  const length = Math.hypot(dx, dz);
  let nearest = 1;
  for (const box of tallBoxesNear(boxes, (px + cx) / 2, (pz + cz) / 2, length / 2)) {
    const hit = enterBox(box, px, py, pz, dx, dy, dz);
    if (hit < nearest) nearest = hit;
  }
  return nearest;
}

/** Slab test in the box's own frame. Returns where the segment enters it, or 1 for a miss. */
function enterBox(
  box: BoxCollider,
  px: number,
  py: number,
  pz: number,
  dx: number,
  dy: number,
  dz: number,
): number {
  const cos = Math.cos(box.yaw);
  const sin = Math.sin(box.yaw);
  // Local +X is (cos, -sin) and local +Z is (sin, cos), as for colliders.
  const ox = px - box.x;
  const oz = pz - box.z;
  const start = [ox * cos - oz * sin, py - box.y, ox * sin + oz * cos];
  const step = [dx * cos - dz * sin, dy, dx * sin + dz * cos];
  const half = [box.hx, box.hy, box.hz];
  let enter = 0;
  let leave = 1;
  let inside = true;
  for (let axis = 0; axis < 3; axis += 1) {
    const s = start[axis] ?? 0;
    const d = step[axis] ?? 0;
    const h = half[axis] ?? 0;
    if (Math.abs(s) > h) inside = false;
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(s) > h) return 1;
      continue;
    }
    let t0 = (-h - s) / d;
    let t1 = (h - s) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0);
    leave = Math.min(leave, t1);
    if (enter > leave) return 1;
  }
  return inside ? 1 : enter;
}
