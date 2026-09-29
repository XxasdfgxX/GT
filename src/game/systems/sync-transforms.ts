/** Copies physics into current transforms, then blends previous and current for the renderer. */

import type { World } from 'bitecs';
import { lerpVec3, slerpQuat, type Quat, type Vec3 } from '../../engine/core/math';
import type { GameContext } from '../../engine/core/context';
import type { WheelPose } from '../../engine/physics/physics-world';
import { PhysicsRef, RenderRef, Transform, Wheel } from '../ecs/components';
import { rendered, simulated, vehicles, wheels } from '../ecs/queries';

const position: Vec3 = { x: 0, y: 0, z: 0 };
const rotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
const fromPos: Vec3 = { x: 0, y: 0, z: 0 };
const toPos: Vec3 = { x: 0, y: 0, z: 0 };
const outPos: Vec3 = { x: 0, y: 0, z: 0 };
const fromRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
const toRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
const outRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
const wheelPoses: WheelPose[] = [
  { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
  { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
  { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
  { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
];

export function syncTransforms(ctx: GameContext, world: World): void {
  for (const eid of simulated(world)) {
    const body = PhysicsRef.body[eid] ?? 0;
    if (body === 0) continue;
    snapshotPrevious(eid);
    ctx.physics.getTransform(body, position, rotation);
    writeCurrent(
      eid,
      position.x,
      position.y,
      position.z,
      rotation.x,
      rotation.y,
      rotation.z,
      rotation.w,
    );
  }
}

export function syncWheels(ctx: GameContext, world: World): void {
  for (const vehicleEid of vehicles(world)) {
    const body = PhysicsRef.body[vehicleEid] ?? 0;
    if (body === 0) continue;
    ctx.physics.wheelPoses(body, wheelPoses);
    for (const eid of wheels(world)) {
      if (Wheel.vehicle[eid] !== vehicleEid) continue;
      const pose = wheelPoses[Wheel.index[eid] ?? 0];
      if (!pose) continue;
      snapshotPrevious(eid);
      writeCurrent(eid, pose.x, pose.y, pose.z, pose.qx, pose.qy, pose.qz, pose.qw);
    }
  }
}

export function pushInterpolatedTransforms(ctx: GameContext, world: World): void {
  const alpha = ctx.time.alpha;
  for (const eid of rendered(world)) {
    const mesh = RenderRef.mesh[eid] ?? 0;
    if (mesh === 0) continue;
    fromPos.x = Transform.ppx[eid] ?? 0;
    fromPos.y = Transform.ppy[eid] ?? 0;
    fromPos.z = Transform.ppz[eid] ?? 0;
    toPos.x = Transform.px[eid] ?? 0;
    toPos.y = Transform.py[eid] ?? 0;
    toPos.z = Transform.pz[eid] ?? 0;
    fromRot.x = Transform.pqx[eid] ?? 0;
    fromRot.y = Transform.pqy[eid] ?? 0;
    fromRot.z = Transform.pqz[eid] ?? 0;
    fromRot.w = Transform.pqw[eid] ?? 1;
    toRot.x = Transform.qx[eid] ?? 0;
    toRot.y = Transform.qy[eid] ?? 0;
    toRot.z = Transform.qz[eid] ?? 0;
    toRot.w = Transform.qw[eid] ?? 1;
    lerpVec3(fromPos, toPos, alpha, outPos);
    slerpQuat(fromRot, toRot, alpha, outRot);
    ctx.renderer.setMeshTransform(mesh, outPos, outRot);
  }
}

function snapshotPrevious(eid: number): void {
  Transform.ppx[eid] = Transform.px[eid] ?? 0;
  Transform.ppy[eid] = Transform.py[eid] ?? 0;
  Transform.ppz[eid] = Transform.pz[eid] ?? 0;
  Transform.pqx[eid] = Transform.qx[eid] ?? 0;
  Transform.pqy[eid] = Transform.qy[eid] ?? 0;
  Transform.pqz[eid] = Transform.qz[eid] ?? 0;
  Transform.pqw[eid] = Transform.qw[eid] ?? 1;
}

function writeCurrent(
  eid: number,
  x: number,
  y: number,
  z: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number,
): void {
  Transform.px[eid] = x;
  Transform.py[eid] = y;
  Transform.pz[eid] = z;
  Transform.qx[eid] = qx;
  Transform.qy[eid] = qy;
  Transform.qz[eid] = qz;
  Transform.qw[eid] = qw;
}
