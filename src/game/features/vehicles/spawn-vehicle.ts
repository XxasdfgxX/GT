/** Spawns the raycast car and the visible model. Wheels stay in the physics only. */

import { addComponent, addEntity, type World } from 'bitecs';
import { carModel } from '../../../content/models';
import { sedan } from '../../../content/vehicles';
import type { GameContext } from '../../../engine/core/context';
import { quatFromYaw } from '../../../engine/core/math';
import { PhysicsRef, RenderRef, Transform, Vehicle, writePose } from '../../ecs/components';

export function spawnVehicle(ctx: GameContext, world: World): number {
  const eid = addEntity(world);
  addComponent(world, eid, Vehicle);
  addComponent(world, eid, Transform);
  addComponent(world, eid, PhysicsRef);
  addComponent(world, eid, RenderRef);

  const { x, y, z } = sedan.spawn;
  const yaw = { x: 0, y: 0, z: 0, w: 1 };
  quatFromYaw(sedan.spawnYaw, yaw);
  writePose(eid, x, y, z);
  Transform.qx[eid] = yaw.x;
  Transform.qy[eid] = yaw.y;
  Transform.qz[eid] = yaw.z;
  Transform.qw[eid] = yaw.w;
  Transform.pqx[eid] = yaw.x;
  Transform.pqy[eid] = yaw.y;
  Transform.pqz[eid] = yaw.z;
  Transform.pqw[eid] = yaw.w;
  PhysicsRef.body[eid] = ctx.physics.createVehicle({
    position: sedan.spawn,
    halfExtents: sedan.halfExtents,
    mass: sedan.mass,
    wheelRadius: sedan.wheelRadius,
    suspensionRestLength: sedan.suspensionRestLength,
    suspensionStiffness: sedan.suspensionStiffness,
    suspensionCompression: sedan.suspensionCompression,
    suspensionRelaxation: sedan.suspensionRelaxation,
    maxSuspensionTravel: sedan.maxSuspensionTravel,
    maxSuspensionForce: sedan.maxSuspensionForce,
    frictionSlip: sedan.frictionSlip,
    sideFrictionStiffness: sedan.sideFrictionStiffness,
    engineForce: sedan.engineForce,
    brakeForce: sedan.brakeForce,
    handbrakeForce: sedan.handbrakeForce,
    maxSteer: sedan.maxSteer,
    steerSign: sedan.steerSign,
  });
  ctx.physics.setTransform(PhysicsRef.body[eid] ?? 0, sedan.spawn, yaw);
  RenderRef.mesh[eid] = ctx.renderer.addModel({
    url: carModel,
    position: sedan.spawn,
    rotation: yaw,
    scale: 0.9,
    offset: { x: 0, y: -1.08, z: 0 },
  });
  return eid;
}
