/** Yaw and compass helpers shared by the camera, the HUD, traffic and the net code. */

import { rotateVec3ByQuat, type Quat, type Vec3 } from '../../engine/core/math';

const nose: Vec3 = { x: 0, y: 0, z: 1 };
const nosed: Vec3 = { x: 0, y: 0, z: 0 };

export function yawFromQuat(rotation: Quat): number {
  rotateVec3ByQuat(rotation, nose, nosed);
  return Math.atan2(nosed.x, nosed.z);
}

/** Camera yaw that sits on the tail, looking along the car's +Z nose. */
export function chaseCameraYaw(vehicleYaw: number): number {
  return vehicleYaw + Math.PI;
}

/** Degrees clockwise from north. Yaw 0 looks south, down the street toward the beach. */
export function compassHeading(yaw: number): number {
  const degrees = ((yaw + Math.PI) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}
