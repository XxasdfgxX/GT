/**
 * Putting the player in a car seat and taking them out. Entering by the door,
 * the network ride and death all go through here, so a seat is always left the same way.
 */

import { hasComponent, type World } from 'bitecs';
import { sampleHeight } from '../../content/map/island-shape';
import { sim } from '../../content/sim';
import { IDENTITY_QUAT, rotateVec3ByQuat, type Quat, type Vec3 } from '../../engine/core/math';
import type { GameContext } from '../context';
import {
  CameraRig,
  Mode,
  PhysicsRef,
  Player,
  RenderRef,
  Traffic,
  TrafficMode,
  Transform,
  Vehicle,
  Velocity,
} from '../ecs/components';
import { clearBoard } from './board-state';
import { chaseCameraYaw, yawFromQuat } from './heading';

const position: Vec3 = { x: 0, y: 0, z: 0 };
const rotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
const localLeft: Vec3 = { x: 0, y: 0, z: 0 };
const offset: Vec3 = { x: 0, y: 0, z: 0 };

export function boardVehicle(ctx: GameContext, eid: number, ride: number): void {
  sitDown(ctx, eid, ride);
  Vehicle.occupied[ride] = 1;
}

/** A stolen lane car stops where it was left. Its stored speed would launch it on re-entry. */
function parkRide(world: World, ride: number): void {
  if (hasComponent(world, ride, Traffic)) {
    Traffic.mode[ride] = TrafficMode.Parked;
    Traffic.speed[ride] = 0;
    Vehicle.speed[ride] = 0;
  } else Vehicle.occupied[ride] = 0;
}

/** Death drops the door walk or the seat. The body is placed by the respawn, not here. */
export function abandonRide(ctx: GameContext, world: World, eid: number): void {
  const mode = Player.mode[eid];
  if (mode === Mode.Boarding) clearBoard();
  if (mode === Mode.Driving) {
    const ride = Player.vehicle[eid] ?? 0;
    parkRide(world, ride);
    CameraRig.distance[eid] = sim.cameraDistanceFoot;
    CameraRig.pivot[eid] = sim.cameraPivotFoot;
    ctx.events.emit('player:exited-vehicle', { vehicle: ride });
  }
  Player.mode[eid] = Mode.OnFoot;
  Player.vehicle[eid] = 0;
}

function sitDown(ctx: GameContext, eid: number, ride: number): void {
  const body = PhysicsRef.body[eid] ?? 0;
  const mesh = RenderRef.mesh[eid] ?? 0;
  if (body !== 0) ctx.physics.setBodyEnabled(body, false);
  if (mesh !== 0) ctx.renderer.setMeshVisible(mesh, false);
  Player.mode[eid] = Mode.Driving;
  Player.vehicle[eid] = ride;
  CameraRig.distance[eid] = sim.cameraDistanceCar;
  CameraRig.pivot[eid] = sim.cameraPivotCar;
  CameraRig.lookOffset[eid] = 0;
  CameraRig.ready[eid] = 0;
  const vehicleBody = PhysicsRef.body[ride] ?? 0;
  if (vehicleBody !== 0) {
    ctx.physics.getTransform(vehicleBody, position, rotation);
    CameraRig.yaw[eid] = chaseCameraYaw(yawFromQuat(rotation));
  }
  ctx.events.emit('player:entered-vehicle', { vehicle: ride });
}

/** Out of the driver door, on the ground beside it. */
export function leaveVehicle(ctx: GameContext, world: World, eid: number): void {
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
  position.y = sampleHeight(position.x, position.z) + sim.playerRadius + sim.playerHalfHeight;
  position.z += offset.z;
  ctx.physics.setBodyEnabled(playerBody, true);
  ctx.physics.setTransform(playerBody, position, IDENTITY_QUAT);
  const mesh = RenderRef.mesh[eid] ?? 0;
  if (mesh !== 0) ctx.renderer.setMeshVisible(mesh, true);
  Player.mode[eid] = Mode.OnFoot;
  parkRide(world, vehicleEid);
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
