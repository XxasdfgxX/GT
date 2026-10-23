/**
 * Real, enterable cars on the curbside spots near the player. A small pool, each car a
 * random model rolled per game: as one falls far behind, it moves to a free spot ahead,
 * out of sight, instead of the whole street of spots holding live cars.
 */

import type { World } from 'bitecs';
import { buildCostaVerde } from '../../../content/city';
import { carIds, type CarId } from '../../../content/cars';
import type { ParkedSpot } from '../../../content/spawns';
import { quatFromYaw, type Quat } from '../../../engine/core/math';
import type { GameContext } from '../../context';
import { PhysicsRef, Transform, Vehicle } from '../../ecs/components';
import { players, vehicles } from '../../ecs/queries';
import { spawnVehicle } from './spawn-vehicle';

export const PARKED_POOL = 12;
/** A car this far behind the player moves on. */
const LEAVE_DISTANCE = 180;
/** It reappears in this band around the player: past where it could be seen popping in. */
const APPEAR_NEAR = 70;
const APPEAR_FAR = 160;
/** Meters kept clear around any other car when picking a spot. */
const SPOT_ROOM = 6;
const CHECK_SECONDS = 1;

interface ParkedCar {
  eid: number;
  /** Index into the city's spots, or -1 once a player has driven it away. */
  spot: number;
}

let pool: ParkedCar[] = [];
let sinceCheck = 0;
const rotation: Quat = { x: 0, y: 0, z: 0, w: 1 };

export function resetParkedCars(): void {
  pool = [];
  sinceCheck = 0;
}

/** One model per car in the pool, any of the drivable ones. */
export function rollParkedModels(random: () => number = Math.random): CarId[] {
  return Array.from(
    { length: PARKED_POOL },
    () => carIds[Math.floor(random() * carIds.length)] ?? 'sedan',
  );
}

/** Fills the spots nearest `near`, keeping clear of the cars already out (the player's own). */
export function spawnParkedCars(
  ctx: GameContext,
  world: World,
  near: { x: number; z: number },
  models: readonly CarId[],
  spots: readonly ParkedSpot[] = buildCostaVerde().parkedSpots,
): void {
  for (const model of models) {
    const spot = freeSpot(world, spots, near, 0, APPEAR_FAR * 2);
    const at = spots[spot];
    if (!at) return;
    pool.push({ eid: spawnVehicle(ctx, world, at, model), spot });
  }
}

/** Every second: a car left far behind moves to a free spot in the band ahead. */
export function parkedCarSystem(
  ctx: GameContext,
  world: World,
  spots: readonly ParkedSpot[] = buildCostaVerde().parkedSpots,
): void {
  sinceCheck += ctx.time.fixedDt;
  if (sinceCheck < CHECK_SECONDS) return;
  sinceCheck = 0;
  let player = -1;
  for (const eid of players(world)) {
    player = eid;
    break;
  }
  if (player < 0) return;
  const near = { x: Transform.px[player] ?? 0, z: Transform.pz[player] ?? 0 };
  for (const car of pool) {
    if (Vehicle.occupied[car.eid] === 1) {
      car.spot = -1;
      continue;
    }
    const distance = Math.hypot(
      (Transform.px[car.eid] ?? 0) - near.x,
      (Transform.pz[car.eid] ?? 0) - near.z,
    );
    if (distance < LEAVE_DISTANCE) continue;
    const spot = freeSpot(world, spots, near, APPEAR_NEAR, APPEAR_FAR);
    const at = spots[spot];
    if (!at) continue;
    car.spot = spot;
    moveTo(ctx, car.eid, at);
  }
}

/** The nearest spot in the band with no car on it, or -1. */
function freeSpot(
  world: World,
  spots: readonly ParkedSpot[],
  near: { x: number; z: number },
  min: number,
  max: number,
): number {
  let best = -1;
  let bestDistance = Infinity;
  spots.forEach((spot, index) => {
    if (pool.some((car) => car.spot === index)) return;
    const distance = Math.hypot(spot.x - near.x, spot.z - near.z);
    if (distance < min || distance > max || distance >= bestDistance) return;
    for (const other of vehicles(world)) {
      const gap = Math.hypot(
        (Transform.px[other] ?? 0) - spot.x,
        (Transform.pz[other] ?? 0) - spot.z,
      );
      if (gap < SPOT_ROOM) return;
    }
    best = index;
    bestDistance = distance;
  });
  return best;
}

function moveTo(ctx: GameContext, eid: number, at: ParkedSpot): void {
  quatFromYaw(at.yaw, rotation);
  const body = PhysicsRef.body[eid] ?? 0;
  if (body !== 0) ctx.physics.setTransform(body, at, rotation);
  Vehicle.speed[eid] = 0;
  Transform.px[eid] = at.x;
  Transform.py[eid] = at.y;
  Transform.pz[eid] = at.z;
  Transform.ppx[eid] = at.x;
  Transform.ppy[eid] = at.y;
  Transform.ppz[eid] = at.z;
  Transform.qx[eid] = rotation.x;
  Transform.qy[eid] = rotation.y;
  Transform.qz[eid] = rotation.z;
  Transform.qw[eid] = rotation.w;
  Transform.pqx[eid] = rotation.x;
  Transform.pqy[eid] = rotation.y;
  Transform.pqz[eid] = rotation.z;
  Transform.pqw[eid] = rotation.w;
}
