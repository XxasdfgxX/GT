/** Enter and exit the nearest car with the interact latch. */

import type { World } from 'bitecs';
import type { GameContext } from '../context';
import type { Quat, Vec3 } from '../../engine/core/math';
import { sim } from '../../content/sim';
import {
  InputState,
  PhysicsRef,
  Player,
  Traffic,
  Transform,
  Vehicle,
  Velocity,
  Mode,
  TrafficMode,
} from '../ecs/components';
import { players, traffic, vehicles } from '../ecs/queries';
import { interactPrompt } from '../play/feel';
import { armBoard } from '../play/board-state';
import { yawFromQuat } from '../play/heading';
import { leaveVehicle } from '../play/seat';
import { ejectDriver } from '../play/drivers';

const position: Vec3 = { x: 0, y: 0, z: 0 };
const rotation: Quat = { x: 0, y: 0, z: 0, w: 1 };

export function interactionSystem(ctx: GameContext, world: World): void {
  for (const eid of players(world)) {
    if (Player.mode[eid] === Mode.Boarding || (Player.health[eid] ?? 0) <= 0) {
      Player.prompt[eid] = 0;
      InputState.interact[eid] = 0;
      continue;
    }
    const driving = Player.mode[eid] === Mode.Driving;
    const distance = driving ? 0 : (nearestRide(world, eid)?.distance ?? Number.POSITIVE_INFINITY);
    Player.prompt[eid] = interactPrompt(driving, distance, sim.interactDistance);
    if (InputState.interact[eid] !== 1) continue;
    InputState.interact[eid] = 0;
    if (driving) leaveVehicle(ctx, world, eid);
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
    if (mode !== TrafficMode.Drive && mode !== TrafficMode.Parked) continue;
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
  if ((Traffic.mode[car] ?? 0) === TrafficMode.Drive)
    ejectDriver(world, car, position.x, position.z, yaw);
  Traffic.mode[car] = TrafficMode.Parked;
  Traffic.speed[car] = 0;
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
