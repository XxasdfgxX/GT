/**
 * Lane cars borrow a pedestrian from the crowd pool as their driver. Traffic seats and
 * ejects them; the crowd system draws them. Neither system imports the other.
 */

import type { World } from 'bitecs';
import { sampleHeight } from '../../content/map/island-shape';
import { characterScale, citizens } from '../../content/models';
import { quatFromYaw } from '../../engine/core/math';
import { CAP, Pedestrian, Transform } from '../ecs/components';
import { pedestrians } from '../ecs/queries';
import { PedState } from '../systems/ped-ai';

const rot = { x: 0, y: 0, z: 0, w: 1 };

/** First pooled pedestrian not in use, or -1. */
export function idlePedestrian(world: World): number {
  for (const eid of pedestrians(world)) {
    if ((Pedestrian.active[eid] ?? 0) === 0) return eid;
  }
  return -1;
}

/** The leaf outfit has no sit clip, so a driver swaps to the next rigged body. */
function seatedVariant(variant: number): number {
  const count = citizens.length;
  for (let step = 0; step < count; step += 1) {
    const index = (variant + step) % count;
    const person = citizens[index];
    if (person && 'sit' in person.clips) return index;
  }
  return variant;
}

/** Puts a free pedestrian in the driver's seat. Returns false when the pool is full. */
export function attachDriver(
  world: World,
  car: number,
  x: number,
  ground: number,
  z: number,
  yaw: number,
  scale: number,
): boolean {
  if (driverOf(world, car) >= 0) return true;
  const eid = idlePedestrian(world);
  if (eid < 0) return false;
  Pedestrian.variant[eid] = seatedVariant(Pedestrian.variant[eid] ?? 0);
  Pedestrian.active[eid] = 1;
  Pedestrian.driving[eid] = 1;
  Pedestrian.car[eid] = car;
  driverByCar[car] = eid;
  Pedestrian.state[eid] = PedState.Idle;
  Pedestrian.count[eid] = 0;
  Pedestrian.health[eid] = 10;
  freshBody(eid);
  placeDriver(eid, x, ground, z, yaw, scale);
  return true;
}

/** A pooled ped may have been culled mid-fight or as a corpse. Clear what would carry over. */
export function freshBody(eid: number): void {
  Pedestrian.hurt[eid] = 0;
  Pedestrian.cool[eid] = 0;
  Pedestrian.swing[eid] = 0;
  Pedestrian.corpse[eid] = 0;
  Pedestrian.stuck[eid] = 0;
  Pedestrian.rammed[eid] = 0;
  Pedestrian.speed[eid] = 0;
}

export function seatDriver(
  world: World,
  car: number,
  x: number,
  ground: number,
  z: number,
  yaw: number,
  scale: number,
): void {
  const eid = driverOf(world, car);
  if (eid < 0) return;
  placeDriver(eid, x, ground, z, yaw, scale);
}

/** Pulls the driver out of the door and sends them running. */
export function ejectDriver(world: World, car: number, x: number, z: number, yaw: number): void {
  const eid = driverOf(world, car);
  if (eid < 0) return;
  const side = yaw + Math.PI / 2;
  const px = x + Math.sin(side) * 1.6;
  const pz = z + Math.cos(side) * 1.6;
  const y = sampleHeight(px, pz);
  Pedestrian.driving[eid] = 0;
  Pedestrian.car[eid] = 0;
  Pedestrian.active[eid] = 1;
  Pedestrian.state[eid] = PedState.Flee;
  Pedestrian.wait[eid] = 2.4;
  Pedestrian.count[eid] = 0;
  freshBody(eid);
  Pedestrian.tx[eid] = px + Math.sin(side) * 8;
  Pedestrian.tz[eid] = pz + Math.cos(side) * 8;
  Transform.ppx[eid] = px;
  Transform.ppy[eid] = y;
  Transform.ppz[eid] = pz;
  Transform.px[eid] = px;
  Transform.py[eid] = y;
  Transform.pz[eid] = pz;
  Pedestrian.yaw[eid] = side;
  quatFromYaw(side, rot);
  Transform.qx[eid] = rot.x;
  Transform.qy[eid] = rot.y;
  Transform.qz[eid] = rot.z;
  Transform.qw[eid] = rot.w;
  Transform.pqx[eid] = rot.x;
  Transform.pqy[eid] = rot.y;
  Transform.pqz[eid] = rot.z;
  Transform.pqw[eid] = rot.w;
}

export function releaseDriver(world: World, car: number): void {
  const eid = driverOf(world, car);
  if (eid < 0) return;
  Pedestrian.driving[eid] = 0;
  Pedestrian.car[eid] = 0;
  Pedestrian.active[eid] = 0;
}

/** Car to driver, so placing 40 cars a tick does not search 120 people each time. */
const driverByCar = new Int32Array(CAP).fill(-1);

function driverOf(world: World, car: number): number {
  const known = driverByCar[car] ?? -1;
  if (known >= 0 && isDriving(known, car)) return known;
  for (const eid of pedestrians(world)) {
    if (!isDriving(eid, car)) continue;
    driverByCar[car] = eid;
    return eid;
  }
  driverByCar[car] = -1;
  return -1;
}

function isDriving(eid: number, car: number): boolean {
  return (Pedestrian.driving[eid] ?? 0) === 1 && (Pedestrian.car[eid] ?? 0) === car;
}

/** car.glb roof height before the traffic scale. The sit clip does not lower the torso. */
const CABIN_ROOF = 1.183;
const STANDING_HEIGHT = 4.845 * characterScale;

function placeDriver(
  eid: number,
  x: number,
  ground: number,
  z: number,
  yaw: number,
  scale: number,
): void {
  // +X is the model's left seat, +Z is the hood.
  const lx = 0.36 * scale;
  const lz = 0.42 * scale;
  const px = x + Math.cos(yaw) * lx + Math.sin(yaw) * lz;
  const pz = z - Math.sin(yaw) * lx + Math.cos(yaw) * lz;
  // Root drops so the head meets the roof. The crowd mesh adds STREET_LIFT on top.
  const py = ground + CABIN_ROOF * scale - STANDING_HEIGHT - 0.08;
  Transform.px[eid] = px;
  Transform.py[eid] = py;
  Transform.pz[eid] = pz;
  Transform.ppx[eid] = px;
  Transform.ppy[eid] = py;
  Transform.ppz[eid] = pz;
  Pedestrian.yaw[eid] = yaw;
  quatFromYaw(yaw, rot);
  Transform.qx[eid] = rot.x;
  Transform.qy[eid] = rot.y;
  Transform.qz[eid] = rot.z;
  Transform.qw[eid] = rot.w;
  Transform.pqx[eid] = rot.x;
  Transform.pqy[eid] = rot.y;
  Transform.pqz[eid] = rot.z;
  Transform.pqw[eid] = rot.w;
}
