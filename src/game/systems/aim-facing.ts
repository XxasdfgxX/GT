/** Turns the on-foot body toward the ground point under the aim cursor. */

import type { World } from 'bitecs';
import { lerp, quatFromYaw, type Quat, type Vec3 } from '../../engine/core/math';
import { sim } from '../../content/sim';
import { aimPointOnPlane, facingToward } from '../play/aim-cursor';
import { CameraRig, Player, Transform, Mode } from '../ecs/components';
import { players } from '../ecs/queries';

const eye: Vec3 = { x: 0, y: 0, z: 0 };
const focus: Vec3 = { x: 0, y: 0, z: 0 };
const rotation: Quat = { x: 0, y: 0, z: 0, w: 1 };

export function facePlayerToCursor(
  world: World,
  locked: boolean,
  aimX: number,
  aimY: number,
  viewWidth: number,
  viewHeight: number,
  alpha: number,
  fovDeg: number,
): void {
  if (!locked) return;
  for (const eid of players(world)) {
    if (Player.mode[eid] === Mode.Driving || Player.mode[eid] === Mode.Boarding) continue;
    if ((Player.health[eid] ?? 0) <= 0) continue;
    if ((Player.hidden[eid] ?? 0) === 1) continue;
    const tx = lerp(Transform.ppx[eid] ?? 0, Transform.px[eid] ?? 0, alpha);
    const ty = lerp(Transform.ppy[eid] ?? 0, Transform.py[eid] ?? 0, alpha);
    const tz = lerp(Transform.ppz[eid] ?? 0, Transform.pz[eid] ?? 0, alpha);
    const pivot = CameraRig.pivot[eid] ?? sim.cameraPivotFoot;
    eye.x = CameraRig.x[eid] ?? 0;
    eye.y = CameraRig.y[eid] ?? 0;
    eye.z = CameraRig.z[eid] ?? 0;
    focus.x = tx;
    focus.y = ty + pivot * 0.55;
    focus.z = tz;
    const hit = aimPointOnPlane(
      eye,
      focus,
      fovDeg,
      aimX,
      aimY,
      viewWidth,
      viewHeight,
      ty - sim.playerRadius - sim.playerHalfHeight,
    );
    if (!hit) continue;
    const yaw = facingToward(tx, tz, hit.x, hit.z);
    if (yaw === null) continue;
    Player.facing[eid] = yaw;
    quatFromYaw(yaw, rotation);
    Transform.qx[eid] = rotation.x;
    Transform.qy[eid] = rotation.y;
    Transform.qz[eid] = rotation.z;
    Transform.qw[eid] = rotation.w;
  }
}
