/** Walkers bumping the player and each other, and keeping off buildings and crossings. */

import { buildCostaVerde } from '../../content/city';
import { sampleHeight } from '../../content/map/island-shape';
import type { WalkQuad } from '../../content/map/road-mesh';
import { trafficCatalog } from '../../content/traffic-catalog';
import { quatFromYaw } from '../../engine/core/math';
import type { GameContext } from '../context';
import { Mode, Pedestrian, PhysicsRef, Player, Traffic, Transform } from '../ecs/components';
import { pedestrians, players, traffic } from '../ecs/queries';
import { meshYaw } from '../play/aim-cursor';
import { tallBoxesNear } from '../play/collider-grid';
import { crowdNear } from '../play/crowd-grid';
import {
  BODY_REACH,
  circlesOverlap,
  pinsCircle,
  shouldTrip,
  sinksDeeper,
  TRIP_SECONDS,
} from '../play/overlap';
import type { World } from 'bitecs';
import { PedState } from './ped-ai';
import { rot } from './pedestrians';

export function shove(
  ctx: GameContext,
  world: World,
  playerEid: number,
  foot: { x: number; z: number },
  speed: number,
): void {
  const body = PhysicsRef.body[playerEid] ?? 0;
  const pose = { x: 0, y: 0, z: 0, w: 1 };
  for (const eid of pedestrians(world)) {
    if ((Pedestrian.active[eid] ?? 0) === 0 || (Pedestrian.driving[eid] ?? 0) === 1) continue;
    if ((Pedestrian.health[eid] ?? 0) <= 0) continue;
    const state = Pedestrian.state[eid] ?? 0;
    if (state === PedState.Trip || state === PedState.Down) continue;
    const nx = Transform.px[eid] ?? 0;
    const nz = Transform.pz[eid] ?? 0;
    if (!circlesOverlap(foot.x, foot.z, nx, nz, BODY_REACH)) continue;
    const dx = foot.x - nx;
    const dz = foot.z - nz;
    const dist = Math.hypot(dx, dz) || 0.001;
    const gap = BODY_REACH - dist;
    if (gap > 0 && body !== 0) {
      const nextX = foot.x + (dx / dist) * gap;
      const nextZ = foot.z + (dz / dist) * gap;
      pose.x = Transform.qx[playerEid] ?? 0;
      pose.y = Transform.qy[playerEid] ?? 0;
      pose.z = Transform.qz[playerEid] ?? 0;
      pose.w = Transform.qw[playerEid] ?? 1;
      ctx.physics.setTransform(body, { x: nextX, y: Transform.py[playerEid] ?? 0, z: nextZ }, pose);
      Transform.px[playerEid] = nextX;
      Transform.pz[playerEid] = nextZ;
      foot.x = nextX;
      foot.z = nextZ;
    }
    if (!shouldTrip(speed, 0)) continue;
    Pedestrian.state[eid] = PedState.Trip;
    Pedestrian.wait[eid] = TRIP_SECONDS;
    Pedestrian.speed[eid] = 0;
  }
}

export function solidAt(
  world: World,
  x: number,
  z: number,
  self: number,
  fromX: number,
  fromZ: number,
): boolean {
  for (const eid of players(world)) {
    if (Player.mode[eid] === Mode.Driving) break;
    if (
      pinsCircle(fromX, fromZ, x, z, Transform.px[eid] ?? 0, Transform.pz[eid] ?? 0, BODY_REACH)
    ) {
      return true;
    }
    break;
  }
  for (const eid of crowdNear(x, z, BODY_REACH)) {
    if (
      eid === self ||
      (Pedestrian.active[eid] ?? 0) === 0 ||
      (Pedestrian.driving[eid] ?? 0) === 1 ||
      (Pedestrian.health[eid] ?? 0) <= 0
    ) {
      continue;
    }
    if (
      pinsCircle(fromX, fromZ, x, z, Transform.px[eid] ?? 0, Transform.pz[eid] ?? 0, BODY_REACH)
    ) {
      return true;
    }
  }
  for (const eid of traffic(world)) {
    if ((Traffic.active[eid] ?? 0) === 0) continue;
    const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
    if (!spec) continue;
    // Lane cars only turn about Y, so the yaw reads straight off the quaternion.
    const yaw = 2 * Math.atan2(Transform.qy[eid] ?? 0, Transform.qw[eid] ?? 1);
    if (
      sinksDeeper(
        fromX,
        fromZ,
        x,
        z,
        Transform.px[eid] ?? 0,
        Transform.pz[eid] ?? 0,
        spec.width / 2,
        spec.length / 2,
        yaw,
        0.35,
      )
    ) {
      return true;
    }
  }
  // The step ends at (x, z) with a 0.35 m body. Big boxes count by their edges, not centers.
  for (const box of tallBoxesNear(buildCostaVerde().colliders, x, z, 0.5)) {
    if (sinksDeeper(fromX, fromZ, x, z, box.x, box.z, box.hx, box.hz, box.yaw, 0.35)) return true;
  }
  return false;
}

export function slide(
  world: World,
  eid: number,
  tx: number,
  tz: number,
  speed: number,
  dt: number,
): boolean {
  const x = Transform.px[eid] ?? 0;
  const z = Transform.pz[eid] ?? 0;
  const dx = tx - x;
  const dz = tz - z;
  const len = Math.hypot(dx, dz);
  Transform.ppx[eid] = x;
  Transform.ppy[eid] = Transform.py[eid] ?? 0;
  Transform.ppz[eid] = z;
  Transform.pqx[eid] = Transform.qx[eid] ?? 0;
  Transform.pqy[eid] = Transform.qy[eid] ?? 0;
  Transform.pqz[eid] = Transform.qz[eid] ?? 0;
  Transform.pqw[eid] = Transform.qw[eid] ?? 1;
  if (len < 0.45) return true;
  const stepDistance = Math.min(len, speed * dt);
  const nx = x + (dx / len) * stepDistance;
  const nz = z + (dz / len) * stepDistance;
  if (solidAt(world, nx, nz, eid, x, z)) {
    Pedestrian.speed[eid] = 0;
    return false;
  }
  Transform.px[eid] = nx;
  Transform.pz[eid] = nz;
  Transform.py[eid] = sampleHeight(nx, nz);
  Pedestrian.yaw[eid] = meshYaw(dx, dz);
  Pedestrian.speed[eid] = speed;
  quatFromYaw(Pedestrian.yaw[eid] ?? 0, rot);
  Transform.qx[eid] = rot.x;
  Transform.qy[eid] = rot.y;
  Transform.qz[eid] = rot.z;
  Transform.qw[eid] = rot.w;
  return false;
}

export function insideCross(walks: WalkQuad[], x: number, z: number): boolean {
  for (let i = 0; i < walks.length; i += 1) {
    const quad = walks[i];
    if (!quad?.crosswalk) continue;
    const midX = (quad.ax + quad.cx) / 2;
    const midZ = (quad.az + quad.cz) / 2;
    if (Math.hypot(midX - x, midZ - z) > 22) continue;
    if (
      pointInTri(x, z, quad.ax, quad.az, quad.bx, quad.bz, quad.cx, quad.cz) ||
      pointInTri(x, z, quad.ax, quad.az, quad.cx, quad.cz, quad.dx, quad.dz)
    ) {
      return true;
    }
  }
  return false;
}

export function pointInTri(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): boolean {
  const c1 = (bx - ax) * (pz - az) - (bz - az) * (px - ax);
  const c2 = (cx - bx) * (pz - bz) - (cz - bz) * (px - bx);
  const c3 = (ax - cx) * (pz - cz) - (az - cz) * (px - cx);
  return (c1 >= 0 && c2 >= 0 && c3 >= 0) || (c1 <= 0 && c2 <= 0 && c3 <= 0);
}
