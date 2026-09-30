/** Door point and the walk that leads up to it. The rig has no open-door clip. */

import { quatFromYaw, rotateVec3ByQuat } from '../../engine/core/math';

export const DOOR_REACH = 0.45;
export const SIT_SECONDS = 0.9;

const rotation = { x: 0, y: 0, z: 0, w: 1 };
const local = { x: 0, y: 0, z: 0 };
const world = { x: 0, y: 0, z: 0 };

/** Driver side, the same left offset used when leaving the car. */
export function driverDoor(
  x: number,
  z: number,
  yaw: number,
  offset: number,
): { x: number; z: number } {
  quatFromYaw(yaw, rotation);
  local.x = -offset;
  local.y = 0;
  local.z = 0;
  rotateVec3ByQuat(rotation, local, world);
  return { x: x + world.x, z: z + world.z };
}

/** Straight walk from the spot where boarding started. Ignores collisions on the way. */
export function approachPoint(
  fromX: number,
  fromZ: number,
  doorX: number,
  doorZ: number,
  speed: number,
  time: number,
): { x: number; z: number; arrived: boolean } {
  const dx = doorX - fromX;
  const dz = doorZ - fromZ;
  const span = Math.hypot(dx, dz);
  if (span <= 0.05) return { x: doorX, z: doorZ, arrived: true };
  const travel = Math.min(span, Math.max(0, speed) * Math.max(0, time));
  if (travel >= span - 1e-4) return { x: doorX, z: doorZ, arrived: true };
  const t = travel / span;
  return { x: fromX + dx * t, z: fromZ + dz * t, arrived: false };
}

export function stepToward(
  x: number,
  z: number,
  targetX: number,
  targetZ: number,
  speed: number,
  dt: number,
): { x: number; z: number; arrived: boolean } {
  const dx = targetX - x;
  const dz = targetZ - z;
  const distance = Math.hypot(dx, dz);
  if (distance <= DOOR_REACH) return { x: targetX, z: targetZ, arrived: true };
  const step = Math.min(distance - DOOR_REACH, speed * dt);
  return {
    x: x + (dx / distance) * step,
    z: z + (dz / distance) * step,
    arrived: false,
  };
}

/** Yaw that looks from the walker toward the car. 0 faces +Z. */
export function facingYaw(x: number, z: number, targetX: number, targetZ: number): number {
  return Math.atan2(targetX - x, targetZ - z);
}
