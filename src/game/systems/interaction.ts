/** Enter and exit the nearest car with the interact latch. */

import { hasComponent, type World } from 'bitecs';
import type { GameContext } from '../../engine/core/context';
import { IDENTITY_QUAT, rotateVec3ByQuat, type Quat, type Vec3 } from '../../engine/core/math';
import { sampleHeight } from '../../content/map/island-shape';
import { sim } from '../../content/sim';
import {
  CameraRig,
  InputState,
  PhysicsRef,
  Player,
  RenderRef,
  Traffic,
  Transform,
  Vehicle,
  Velocity,
} from '../ecs/components';
import { players, traffic, vehicles } from '../ecs/queries';
import { interactPrompt } from '../play/feel';
import { armBoard } from '../play/board-state';
import { chaseCameraYaw, yawFromQuat } from './camera-follow';
import { Mode } from './player-movement';
import { ejectDriver } from './pedestrians';

const MODE_DRIVE = 0;
const MODE_PARKED = 4;

const position: Vec3 = { x: 0, y: 0, z: 0 };
const rotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
const localLeft: Vec3 = { x: 0, y: 0, z: 0 };
const offset: Vec3 = { x: 0, y: 0, z: 0 };

export function interactionSystem(ctx: GameContext, world: World): void {
  for (const eid of players(world)) {
    if (Player.mode[eid] === Mode.Boarding) {
      Player.prompt[eid] = 0;
      InputState.interact[eid] = 0;
      continue;
    }
    const driving = Player.mode[eid] === Mode.Driving;
    const distance = driving ? 0 : (nearestRide(world, eid)?.distance ?? Number.POSITIVE_INFINITY);
    Player.prompt[eid] = interactPrompt(driving, distance, sim.interactDistance);
    if (InputState.interact[eid] !== 1) continue;
    InputState.interact[eid] = 0;
    if (driving) exitVehicle(ctx, world, eid);
    else enterNearest(ctx, world, eid);
  }
}

function nearestRide(
  world: World,
  eid: number,
): { ride: number; kind: 'player' | 'traffic'; distance: number } | undefined {
  const px = Transform.px[eid] ?? 0;
  const pz = Transform.pz[eid] ?? 0;
  let best: { ride: number; kind: 'player' | 'traffic'; distance: number } | undefined;
  const consider = (ride: number, kind: 'player' | 'traffic') => {
    const distance = Math.hypot(px - (Transform.px[ride] ?? 0), pz - (Transform.pz[ride] ?? 0));
    if (!best || distance < best.distance) best = { ride, kind, distance };
  };
  for (const vehicleEid of vehicles(world)) {
    if (Vehicle.occupied[vehicleEid] === 1) continue;
    consider(vehicleEid, 'player');
  }
  for (const car of traffic(world)) {
    if ((Traffic.active[car] ?? 0) === 0) continue;
    const mode = Traffic.mode[car] ?? 0;
    if (mode !== MODE_DRIVE && mode !== MODE_PARKED) continue;
    consider(car, 'traffic');
  }
  return best;
}

function enterNearest(ctx: GameContext, world: World, eid: number): void {
  const nearest = nearestRide(world, eid);
  if (!nearest || nearest.distance > sim.interactDistance) return;
  if (nearest.kind === 'traffic') enterTraffic(ctx, world, eid, nearest.ride);
  else enterPlayerCar(ctx, eid, nearest.ride);
}

function enterTraffic(ctx: GameContext, world: World, eid: number, car: number): void {
  const body = PhysicsRef.body[car] ?? 0;
  if (body === 0) return;
  ctx.physics.getTransform(body, position, rotation);
  const yaw = yawFromQuat(rotation);
  if ((Traffic.mode[car] ?? 0) === MODE_DRIVE) ejectDriver(world, car, position.x, position.z, yaw);
  Traffic.mode[car] = MODE_PARKED;
  holdStill(eid);
  armBoard(eid, car, 'traffic');
  Player.mode[eid] = Mode.Boarding;
}

function enterPlayerCar(_ctx: GameContext, eid: number, vehicleEid: number): void {
  holdStill(eid);
  armBoard(eid, vehicleEid, 'player');
  Player.mode[eid] = Mode.Boarding;
}

function holdStill(eid: number): void {
  Velocity.x[eid] = 0;
  Velocity.y[eid] = 0;
  Velocity.z[eid] = 0;
}

export function boardVehicle(ctx: GameContext, eid: number, ride: number): void {
  sitDown(ctx, eid, ride);
  Vehicle.occupied[ride] = 1;
}

export function leaveVehicle(ctx: GameContext, world: World, eid: number): void {
  exitVehicle(ctx, world, eid);
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

function exitVehicle(ctx: GameContext, world: World, eid: number): void {
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
  if (hasComponent(world, vehicleEid, Traffic)) Traffic.mode[vehicleEid] = MODE_PARKED;
  else Vehicle.occupied[vehicleEid] = 0;
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
