/** Pulling cars out of buildings and each other, and checking spawn spots are free. */

import { buildCostaVerde } from '../../content/city';
import type { RoadGraph } from '../../content/map/roads';
import { trafficCatalog } from '../../content/traffic-catalog';
import { sedan } from '../../content/vehicles';
import type { GameContext } from '../context';
import { Traffic, TrafficMode, Transform } from '../ecs/components';
import { traffic, vehicles } from '../ecs/queries';
import { tallBoxesNear } from '../../sim/collider-grid';
import type { World } from 'bitecs';
import {
  batchCount,
  batchHx,
  batchHz,
  batchX,
  batchYaw,
  batchZ,
  heading,
  place,
  pos,
  yawOf,
} from './traffic';
import { boxExit, carBoxesOverlap } from '../../sim/traffic-ai';

export const SOLID_CAP = 48;

export const solidX = new Float32Array(SOLID_CAP);

export const solidZ = new Float32Array(SOLID_CAP);

export const solidYaw = new Float32Array(SOLID_CAP);

export const solidHx = new Float32Array(SOLID_CAP);

export const solidHz = new Float32Array(SOLID_CAP);

export const solidEid = new Int16Array(SOLID_CAP);

export const solidLock = new Uint8Array(SOLID_CAP);

/** Eases a lane car out of another body. One short step, so a bump does not fling it. */
export function unstick(ctx: GameContext, world: World, graph: RoadGraph): void {
  const count = gatherSolids(world);
  for (let i = 0; i < count; i += 1) {
    if (solidLock[i] === 1) continue;
    if (!hitsAnother(i, count)) continue;
    const eid = solidEid[i] ?? 0;
    Traffic.speed[eid] = 0;
    Traffic.along[eid] = Math.max(0, (Traffic.along[eid] ?? 0) - 0.35);
    place(ctx, world, graph, eid);
  }
}

export function gatherSolids(world: World): number {
  let count = 0;
  for (const eid of traffic(world)) {
    if ((Traffic.active[eid] ?? 0) === 0 || count >= SOLID_CAP - 1) continue;
    const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
    if (!spec) continue;
    const mode = Traffic.mode[eid] ?? 0;
    solidX[count] = Transform.px[eid] ?? 0;
    solidZ[count] = Transform.pz[eid] ?? 0;
    solidYaw[count] = yawOf(eid);
    solidHx[count] = spec.width / 2;
    solidHz[count] = spec.length / 2;
    solidEid[count] = eid;
    solidLock[count] =
      mode === TrafficMode.Wreck || mode === TrafficMode.Player || mode === TrafficMode.Parked
        ? 1
        : 0;
    count += 1;
  }
  for (const eid of vehicles(world)) {
    if (count >= SOLID_CAP) break;
    solidX[count] = Transform.px[eid] ?? 0;
    solidZ[count] = Transform.pz[eid] ?? 0;
    solidYaw[count] = yawOf(eid);
    solidHx[count] = sedan.halfExtents.x;
    solidHz[count] = sedan.halfExtents.z;
    solidEid[count] = eid;
    solidLock[count] = 1;
    count += 1;
  }
  return count;
}

export function hitsAnother(index: number, count: number): boolean {
  for (let j = 0; j < count; j += 1) {
    if (j === index) continue;
    if (
      carBoxesOverlap(
        solidX[index] ?? 0,
        solidZ[index] ?? 0,
        solidYaw[index] ?? 0,
        solidHx[index] ?? 0,
        solidHz[index] ?? 0,
        solidX[j] ?? 0,
        solidZ[j] ?? 0,
        solidYaw[j] ?? 0,
        solidHx[j] ?? 0,
        solidHz[j] ?? 0,
      )
    ) {
      return true;
    }
  }
  return false;
}

export function obstruction(
  world: World,
  self: number,
  x: number,
  z: number,
  yaw: number,
  hx: number,
  hz: number,
): number {
  return deepestExit(world, self, x, z, yaw, hx, hz).depth;
}

export function deepestExit(
  world: World,
  self: number,
  x: number,
  z: number,
  yaw: number,
  hx: number,
  hz: number,
): { x: number; z: number; depth: number } {
  let bestX = 0;
  let bestZ = 0;
  let best = 0;
  const consider = (push: { x: number; z: number; depth: number }) => {
    if (push.depth <= best) return;
    best = push.depth;
    bestX = push.x;
    bestZ = push.z;
  };
  for (const other of traffic(world)) {
    if (other === self || (Traffic.active[other] ?? 0) === 0) continue;
    const spec = trafficCatalog[Traffic.variant[other] ?? 0];
    if (!spec) continue;
    consider(
      boxExit(
        x,
        z,
        yaw,
        hx,
        hz,
        Transform.px[other] ?? 0,
        Transform.pz[other] ?? 0,
        yawOf(other),
        spec.width / 2,
        spec.length / 2,
      ),
    );
  }
  for (const car of vehicles(world)) {
    consider(
      boxExit(
        x,
        z,
        yaw,
        hx,
        hz,
        Transform.px[car] ?? 0,
        Transform.pz[car] ?? 0,
        yawOf(car),
        sedan.halfExtents.x,
        sedan.halfExtents.z,
      ),
    );
  }
  consider(buildingPush(x, z, yaw, hx, hz));
  return { x: bestX, z: bestZ, depth: best };
}

export function buildingPush(
  x: number,
  z: number,
  yaw: number,
  hx: number,
  hz: number,
): { x: number; z: number; depth: number } {
  let bestX = 0;
  let bestZ = 0;
  let best = 0;
  for (const box of tallBoxesNear(buildCostaVerde().colliders, x, z, Math.hypot(hx, hz))) {
    const push = boxExit(x, z, yaw, hx, hz, box.x, box.z, box.yaw, box.hx, box.hz);
    if (push.depth <= best) continue;
    best = push.depth;
    bestX = push.x;
    bestZ = push.z;
  }
  return { x: bestX, z: bestZ, depth: best };
}

export function slideOut(target: { x: number; z: number }, pushX: number, pushZ: number): void {
  const len = Math.hypot(pushX, pushZ);
  if (len < 1e-4) return;
  const scale = len > 0.45 ? 0.45 / len : 1;
  target.x += pushX * scale;
  target.z += pushZ * scale;
}

export function hitsBuilding(x: number, z: number, yaw: number, hx: number, hz: number): boolean {
  for (const box of tallBoxesNear(buildCostaVerde().colliders, x, z, Math.hypot(hx, hz))) {
    if (carBoxesOverlap(x, z, yaw, hx, hz, box.x, box.z, box.yaw, box.hx, box.hz)) return true;
  }
  return false;
}

export function spotTaken(world: World, eid: number, hx: number, hz: number): boolean {
  if (hitsTraffic(world, eid, pos.x, pos.z, heading, hx, hz)) return true;
  for (let i = 0; i < batchCount; i += 1) {
    if (
      carBoxesOverlap(
        pos.x,
        pos.z,
        heading,
        hx,
        hz,
        batchX[i] ?? 0,
        batchZ[i] ?? 0,
        batchYaw[i] ?? 0,
        batchHx[i] ?? 0,
        batchHz[i] ?? 0,
      )
    ) {
      return true;
    }
  }
  return false;
}

export function hitsTraffic(
  world: World,
  self: number,
  x: number,
  z: number,
  yaw: number,
  hx: number,
  hz: number,
): boolean {
  for (const other of traffic(world)) {
    if (other === self || (Traffic.active[other] ?? 0) === 0) continue;
    const spec = trafficCatalog[Traffic.variant[other] ?? 0];
    if (!spec) continue;
    if (
      carBoxesOverlap(
        x,
        z,
        yaw,
        hx,
        hz,
        Transform.px[other] ?? 0,
        Transform.pz[other] ?? 0,
        yawOf(other),
        spec.width / 2,
        spec.length / 2,
      )
    ) {
      return true;
    }
  }
  for (const car of vehicles(world)) {
    if (
      carBoxesOverlap(
        x,
        z,
        yaw,
        hx,
        hz,
        Transform.px[car] ?? 0,
        Transform.pz[car] ?? 0,
        yawOf(car),
        sedan.halfExtents.x,
        sedan.halfExtents.z,
      )
    ) {
      return true;
    }
  }
  return false;
}
