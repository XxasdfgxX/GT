/** Enter and exit the nearest car with the interact latch. */

import type { World } from 'bitecs';
import type { GameContext } from '../../engine/core/context';
import { IDENTITY_QUAT, rotateVec3ByQuat, type Quat, type Vec3 } from '../../engine/core/math';
import { sim } from '../../content/sim';
import {
  CameraRig,
  InputState,
  PhysicsRef,
  Player,
  RenderRef,
  Transform,
  Vehicle,
  Velocity,
} from '../ecs/components';
import { players, vehicles } from '../ecs/queries';
import { interactPrompt } from '../play/feel';
import { chaseCameraYaw, yawFromQuat } from './camera-follow';
import { Mode } from './player-movement';

const position: Vec3 = { x: 0, y: 0, z: 0 };
const rotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
const localLeft: Vec3 = { x: 0, y: 0, z: 0 };
const offset: Vec3 = { x: 0, y: 0, z: 0 };

export function interactionSystem(ctx: GameContext, world: World): void {
  for (const eid of players(world)) {
    const driving = Player.mode[eid] === Mode.Driving;
    const distance = driving ? 0 : nearestVehicleDistance(world, eid);
    Player.prompt[eid] = interactPrompt(driving, distance, sim.interactDistance);
    if (InputState.interact[eid] !== 1) continue;
    InputState.interact[eid] = 0;
    if (driving) exitVehicle(ctx, eid);
    else enterNearest(ctx, world, eid);
  }
}

function nearestVehicleDistance(world: World, eid: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const vehicleEid of vehicles(world)) {
    const dx = (Transform.px[eid] ?? 0) - (Transform.px[vehicleEid] ?? 0);
    const dz = (Transform.pz[eid] ?? 0) - (Transform.pz[vehicleEid] ?? 0);
    const distance = Math.hypot(dx, dz);
    if (distance < best) best = distance;
  }
  return best;
}

function enterNearest(ctx: GameContext, world: World, eid: number): void {
  let best = -1;
  let bestDistance = sim.interactDistance * sim.interactDistance;
  for (const vehicleEid of vehicles(world)) {
    if (Vehicle.occupied[vehicleEid] === 1) continue;
    const dx = (Transform.px[eid] ?? 0) - (Transform.px[vehicleEid] ?? 0);
    const dz = (Transform.pz[eid] ?? 0) - (Transform.pz[vehicleEid] ?? 0);
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = vehicleEid;
    }
  }
  if (best < 0) return;
  const body = PhysicsRef.body[eid] ?? 0;
  const mesh = RenderRef.mesh[eid] ?? 0;
  if (body !== 0) ctx.physics.setBodyEnabled(body, false);
  if (mesh !== 0) ctx.renderer.setMeshVisible(mesh, false);
  Player.mode[eid] = Mode.Driving;
  Player.vehicle[eid] = best;
  Vehicle.occupied[best] = 1;
  CameraRig.distance[eid] = sim.cameraDistanceCar;
  CameraRig.pivot[eid] = sim.cameraPivotCar;
  CameraRig.lookOffset[eid] = 0;
  CameraRig.ready[eid] = 0;
  const vehicleBody = PhysicsRef.body[best] ?? 0;
  if (vehicleBody !== 0) {
    ctx.physics.getTransform(vehicleBody, position, rotation);
    CameraRig.yaw[eid] = chaseCameraYaw(yawFromQuat(rotation));
  }
  ctx.events.emit('player:entered-vehicle', { vehicle: best });
}

function exitVehicle(ctx: GameContext, eid: number): void {
  const vehicleEid = Player.vehicle[eid] ?? 0;
  const vehicleBody = PhysicsRef.body[vehicleEid] ?? 0;
  const playerBody = PhysicsRef.body[eid] ?? 0;
  if (vehicleBody === 0 || playerBody === 0) return;
  ctx.physics.getTransform(vehicleBody, position, rotation);
  localLeft.x = -sim.exitOffset;
  localLeft.y = 0;
  localLeft.z = 0;
  rotateVec3ByQuat(rotation, localLeft, offset);
  position.x += offset.x;
  position.y = sim.playerRadius + sim.playerHalfHeight;
  position.z += offset.z;
  ctx.physics.setBodyEnabled(playerBody, true);
  ctx.physics.setTransform(playerBody, position, IDENTITY_QUAT);
  const mesh = RenderRef.mesh[eid] ?? 0;
  if (mesh !== 0) ctx.renderer.setMeshVisible(mesh, true);
  Player.mode[eid] = Mode.OnFoot;
  Vehicle.occupied[vehicleEid] = 0;
  Velocity.x[eid] = 0;
  Velocity.y[eid] = 0;
  Velocity.z[eid] = 0;
  Transform.px[eid] = position.x;
  Transform.py[eid] = position.y;
  Transform.pz[eid] = position.z;
  Transform.ppx[eid] = position.x;
  Transform.ppy[eid] = position.y;
  Transform.ppz[eid] = position.z;
  CameraRig.distance[eid] = sim.cameraDistanceFoot;
  CameraRig.pivot[eid] = sim.cameraPivotFoot;
  ctx.events.emit('player:exited-vehicle', { vehicle: vehicleEid });
}
