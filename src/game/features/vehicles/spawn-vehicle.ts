/** Spawns the raycast car and the visible model. Wheels stay in the physics only. */

import { addComponent, addEntity, type World } from 'bitecs';
import { carBody, carIds, engineForceFor, maxSpeedMs, type CarId } from '../../../content/cars';
import { sampleHeight } from '../../../content/map/island-shape';
import { STREET_LIFT } from '../../../content/map/road-mesh';
import { trafficCatalog } from '../../../content/traffic-catalog';
import { sedan } from '../../../content/vehicles';
import type { GameContext } from '../../../engine/core/context';
import { quatFromYaw } from '../../../engine/core/math';
import { PhysicsRef, RenderRef, Transform, Vehicle, writePose } from '../../ecs/components';

export function spawnVehicle(
  ctx: GameContext,
  world: World,
  at?: { x: number; y: number; z: number; yaw: number },
  carId: CarId = 'aston',
): number {
  const eid = addEntity(world);
  addComponent(world, eid, Vehicle);
  addComponent(world, eid, Transform);
  addComponent(world, eid, PhysicsRef);
  addComponent(world, eid, RenderRef);

  const car = carBody(carId);
  const paint = trafficCatalog.find((item) => item.id === carId);
  const x = at?.x ?? sedan.spawn.x;
  const z = at?.z ?? sedan.spawn.z;
  const y = at?.y ?? sampleHeight(x, z) + sedan.spawn.y;
  const position = { x, y, z };
  const yaw = { x: 0, y: 0, z: 0, w: 1 };
  quatFromYaw(at?.yaw ?? sedan.spawnYaw, yaw);
  Vehicle.maxSpeed[eid] = maxSpeedMs(car.maxSpeedKmh);
  const model = carIds.indexOf(carId);
  Vehicle.model[eid] = model < 0 ? 0 : model;
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
    halfExtents: car.halfExtents,
    mass: car.mass,
    wheelRadius: car.wheelRadius,
    suspensionRestLength: sedan.suspensionRestLength,
    suspensionStiffness: sedan.suspensionStiffness,
    suspensionCompression: sedan.suspensionCompression,
    suspensionRelaxation: sedan.suspensionRelaxation,
    maxSuspensionTravel: sedan.maxSuspensionTravel,
    maxSuspensionForce: sedan.maxSuspensionForce,
    frictionSlip: sedan.frictionSlip,
    sideFrictionStiffness: sedan.sideFrictionStiffness,
    engineForce: engineForceFor(car.torque),
    brakeForce: sedan.brakeForce,
    handbrakeForce: sedan.handbrakeForce,
    maxSteer: sedan.maxSteer,
    steerSign: sedan.steerSign,
  });
  ctx.physics.setTransform(PhysicsRef.body[eid] ?? 0, position, yaw);
  RenderRef.mesh[eid] = ctx.renderer.addModel({
    url: car.url,
    position,
    rotation: yaw,
    scale: car.scale,
    offset: { x: 0, y: STREET_LIFT - car.ride, z: 0 },
    ...(paint ? { tint: paint.color } : {}),
  });
  return eid;
}
