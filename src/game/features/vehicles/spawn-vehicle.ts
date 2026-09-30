/** Spawns the raycast car and the visible model. Wheels stay in the physics only. */

import { addComponent, addEntity, type World } from 'bitecs';
import { sampleHeight } from '../../../content/map/island-shape';
import { STREET_LIFT } from '../../../content/map/road-mesh';
import { carModel } from '../../../content/models';
import { sedan } from '../../../content/vehicles';
import type { GameContext } from '../../../engine/core/context';
import { quatFromYaw } from '../../../engine/core/math';
import { PhysicsRef, RenderRef, Transform, Vehicle, writePose } from '../../ecs/components';

export function spawnVehicle(
  ctx: GameContext,
  world: World,
  at?: { x: number; y: number; z: number; yaw: number },
): number {
  const eid = addEntity(world);
  addComponent(world, eid, Vehicle);
  addComponent(world, eid, Transform);
  addComponent(world, eid, PhysicsRef);
  addComponent(world, eid, RenderRef);

  const x = at?.x ?? sedan.spawn.x;
  const z = at?.z ?? sedan.spawn.z;
  const y = at?.y ?? sampleHeight(x, z) + sedan.spawn.y;
  const position = { x, y, z };
  const yaw = { x: 0, y: 0, z: 0, w: 1 };
  quatFromYaw(at?.yaw ?? sedan.spawnYaw, yaw);
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
    position,
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
  ctx.physics.setTransform(PhysicsRef.body[eid] ?? 0, position, yaw);
  RenderRef.mesh[eid] = ctx.renderer.addModel({
    url: carModel,
    position,
    rotation: yaw,
    scale: 0.9,
    // Chassis rests 1.04 m above the heightfield. The mesh origin is the tire contact.
    offset: { x: 0, y: STREET_LIFT - 1.04, z: 0 },
  });
  return eid;
}
