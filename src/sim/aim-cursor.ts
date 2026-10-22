/** Ground point the body turns toward. */

import type { Vec3 } from '../engine/core/math';

const HORIZON_REACH = 64;

const forward: Vec3 = { x: 0, y: 0, z: 0 };
const right: Vec3 = { x: 0, y: 0, z: 0 };
const up: Vec3 = { x: 0, y: 0, z: 0 };
const worldUp: Vec3 = { x: 0, y: 1, z: 0 };
const ray: Vec3 = { x: 0, y: 0, z: 0 };

/** Yaw for the character mesh. The mesh adds half a turn, so this faces the step. */
export function meshYaw(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** Body yaw. The mesh adds half a turn, so the signs match walking toward the point. */
export function facingToward(px: number, pz: number, tx: number, tz: number): number | null {
  const dx = tx - px;
  const dz = tz - pz;
  if (dx * dx + dz * dz < 1e-4) return null;
  return meshYaw(dx, dz);
}

/** Where the view ray through a pixel meets a horizontal plane. A sky ray aims along the horizon. */
export function aimPointOnPlane(
  eye: Vec3,
  target: Vec3,
  fovDeg: number,
  pixelX: number,
  pixelY: number,
  width: number,
  height: number,
  planeY: number,
): { x: number; z: number } | null {
  if (width < 1 || height < 1) return null;
  forward.x = target.x - eye.x;
  forward.y = target.y - eye.y;
  forward.z = target.z - eye.z;
  if (!normalize(forward)) return null;
  cross(forward, worldUp, right);
  if (!normalize(right)) return null;
  cross(right, forward, up);

  const ndcX = (pixelX / width) * 2 - 1;
  const ndcY = 1 - (pixelY / height) * 2;
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
  const aspect = width / height;
  const localX = ndcX * aspect * tanHalf;
  const localY = ndcY * tanHalf;
  ray.x = right.x * localX + up.x * localY + forward.x;
  ray.y = right.y * localX + up.y * localY + forward.y;
  ray.z = right.z * localX + up.z * localY + forward.z;
  if (!normalize(ray)) return null;

  if (ray.y < -1e-6) {
    const distance = (planeY - eye.y) / ray.y;
    if (distance > 0) {
      return { x: eye.x + ray.x * distance, z: eye.z + ray.z * distance };
    }
  }
  const flat = Math.hypot(ray.x, ray.z);
  if (flat < 1e-6) return null;
  return {
    x: eye.x + (ray.x / flat) * HORIZON_REACH,
    z: eye.z + (ray.z / flat) * HORIZON_REACH,
  };
}

function cross(a: Vec3, b: Vec3, out: Vec3): void {
  out.x = a.y * b.z - a.z * b.y;
  out.y = a.z * b.x - a.x * b.z;
  out.z = a.x * b.y - a.y * b.x;
}

function normalize(out: Vec3): boolean {
  const length = Math.hypot(out.x, out.y, out.z);
  if (length < 1e-8) return false;
  out.x /= length;
  out.y /= length;
  out.z /= length;
  return true;
}
