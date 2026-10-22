/** Walks the local player to the driver door, sits, then hands off to the seat. */

import { hasComponent, type World } from 'bitecs';
import { carCatalog } from '../../content/cars';
import { sim } from '../../content/sim';
import { trafficCatalog } from '../../content/traffic-catalog';
import { quatFromYaw } from '../../engine/core/math';
import type { GameContext } from '../../engine/core/context';
import { PhysicsRef, Player, Traffic, Transform, Vehicle } from '../ecs/components';
import { SIT_SECONDS, approachPoint, driverDoor, facingYaw } from '../play/board';
import { clearBoard, currentBoard } from '../play/board-state';
import { yawFromQuat } from './camera-follow';
import { boardVehicle } from './interaction';
import { capsuleFloor, Mode } from './player-movement';

const MODE_PLAYER = 3;
const WALK_LIMIT = 4;

const position = { x: 0, y: 0, z: 0 };
const rotation = { x: 0, y: 0, z: 0, w: 1 };
const place = { x: 0, y: 0, z: 0 };

export interface CarTitle {
  name: string;
  detail: string;
  x: number;
  y: number;
  z: number;
}

export function boardingClip(): 'walk' | 'sit' | null {
  const job = currentBoard();
  if (!job) return null;
  return job.phase === 'sit' ? 'sit' : 'walk';
}

export function readCarTitle(world: World): CarTitle | null {
  const job = currentBoard();
  if (!job) return null;
  const profile = profileFor(world, job.ride);
  return {
    name: profile?.name ?? 'Carro',
    detail: profile ? `${profile.maxSpeedKmh} km/h · ${profile.torque}` : '',
    x: Transform.px[job.ride] ?? 0,
    y: Transform.py[job.ride] ?? 0,
    z: Transform.pz[job.ride] ?? 0,
  };
}

export function boardCarSystem(ctx: GameContext, world: World): void {
  const job = currentBoard();
  if (!job) return;
  const playerBody = PhysicsRef.body[job.player] ?? 0;
  const rideBody = PhysicsRef.body[job.ride] ?? 0;
  if (playerBody === 0 || rideBody === 0) {
    Player.mode[job.player] = Mode.OnFoot;
    clearBoard();
    return;
  }
  ctx.physics.getTransform(rideBody, position, rotation);
  const carX = position.x;
  const carZ = position.z;
  const door = driverDoor(carX, carZ, yawFromQuat(rotation), sim.exitOffset);
  ctx.physics.getTransform(playerBody, position, rotation);
  job.time += ctx.time.fixedDt;
  if (!job.locked) {
    job.fromX = position.x;
    job.fromZ = position.z;
    job.doorX = door.x;
    job.doorZ = door.z;
    job.locked = true;
  }

  if (job.phase === 'walk') {
    const next = approachPoint(job.fromX, job.fromZ, job.doorX, job.doorZ, sim.walkSpeed, job.time);
    const face = facingYaw(job.fromX, job.fromZ, job.doorX, job.doorZ);
    Player.facing[job.player] = face;
    standAt(ctx, playerBody, next.x, next.z, face);
    if (next.arrived || job.time >= WALK_LIMIT) {
      job.phase = 'sit';
      job.time = 0;
      Player.facing[job.player] = facingYaw(job.doorX, job.doorZ, carX, carZ);
    }
    return;
  }

  const face = facingYaw(job.doorX, job.doorZ, carX, carZ);
  Player.facing[job.player] = face;
  standAt(ctx, playerBody, job.doorX, job.doorZ, face);
  if (job.time < SIT_SECONDS) return;
  const ride = job.ride;
  const player = job.player;
  const kind = job.kind;
  clearBoard();
  if (kind === 'traffic' && hasComponent(world, ride, Traffic)) Traffic.mode[ride] = MODE_PLAYER;
  boardVehicle(ctx, player, ride);
}

function standAt(ctx: GameContext, body: number, x: number, z: number, yaw: number): void {
  place.x = x;
  place.y = capsuleFloor(x, z);
  place.z = z;
  quatFromYaw(yaw, rotation);
  ctx.physics.setTransform(body, place, rotation);
}

function profileFor(world: World, ride: number) {
  if (hasComponent(world, ride, Traffic)) {
    const spec = trafficCatalog[Traffic.variant[ride] ?? 0];
    return spec ? carCatalog.find((car) => car.id === spec.id) : undefined;
  }
  return carCatalog[Vehicle.model[ride] ?? 0];
}
