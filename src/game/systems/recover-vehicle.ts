/** Flips a chassis back onto its wheels after it has rested on the roof for a second. */

import type { World } from 'bitecs';
import { sampleHeight } from '../../content/map/island-shape';
import { buildCostaVerde } from '../../content/city';
import { carBody, carCatalog } from '../../content/cars';
import { sim } from '../../content/sim';
import { trafficCatalog } from '../../content/traffic-catalog';
import { sedan } from '../../content/vehicles';
import type { GameContext } from '../../engine/core/context';
import { quatFromYaw } from '../../engine/core/math';
import { CAP, PhysicsRef, Player, Traffic, Vehicle } from '../ecs/components';
import { players, traffic, vehicles } from '../ecs/queries';
import { circleBoxExit } from '../play/overlap';
import { yawFromQuat } from './camera-follow';
import { boxExit } from './traffic-ai';
import { chassisUp, headingYaw, readyToFlip, roofTime } from '../play/upright';
import { MODE_PLAYER, MODE_WRECK } from './traffic';
import { Mode } from './player-movement';

const spent = new Float32Array(CAP);
const pos = { x: 0, y: 0, z: 0 };
const rot = { x: 0, y: 0, z: 0, w: 1 };
const upright = { x: 0, y: 0, z: 0, w: 1 };

export function recoverVehicles(ctx: GameContext, world: World): void {
  const dt = ctx.time.fixedDt;
  for (const eid of vehicles(world)) recover(ctx, eid, dt, sedan.spawn.y);
  for (const eid of traffic(world)) {
    if ((Traffic.mode[eid] ?? 0) !== MODE_WRECK) {
      spent[eid] = 0;
      continue;
    }
    const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
    recover(ctx, eid, dt, (spec?.height ?? 1.4) / 2 + 0.2);
  }
}

function recover(ctx: GameContext, eid: number, dt: number, lift: number): void {
  const body = PhysicsRef.body[eid] ?? 0;
  if (body === 0) return;
  ctx.physics.getTransform(body, pos, rot);
  const waited = roofTime(spent[eid] ?? 0, chassisUp(rot.x, rot.y, rot.z, rot.w), dt);
  spent[eid] = waited;
  if (!readyToFlip(waited)) return;
  spent[eid] = 0;
  quatFromYaw(headingYaw(rot.x, rot.y, rot.z, rot.w), upright);
  pos.y = sampleHeight(pos.x, pos.z) + lift;
  ctx.physics.setTransform(body, pos, upright);
}

const releasePos = { x: 0, y: 0, z: 0 };
const releaseRot = { x: 0, y: 0, z: 0, w: 1 };
const ridePos = { x: 0, y: 0, z: 0 };
const rideRot = { x: 0, y: 0, z: 0, w: 1 };

/** A brush against a wall is not a bury. Shallow contact must not launch the body. */
const BURY_DEPTH = 0.4;

/** Walks a body out of a building it has clipped into, a short step at a time. */
export function releaseFromBuildings(ctx: GameContext, world: World): void {
  for (const eid of players(world)) {
    if (Player.mode[eid] !== Mode.OnFoot) continue;
    const body = PhysicsRef.body[eid] ?? 0;
    if (body === 0) continue;
    ctx.physics.getTransform(body, releasePos, releaseRot);
    const push = deepestCircle(releasePos.x, releasePos.z, sim.playerRadius);
    if (push.depth >= BURY_DEPTH) nudge(ctx, body, push.x, push.z);
    ctx.physics.getTransform(body, releasePos, releaseRot);
    const ride = deepestRide(ctx, world, releasePos.x, releasePos.z);
    if (ride.depth >= 0.08) nudge(ctx, body, ride.x, ride.z);
  }
  for (const eid of vehicles(world)) {
    if ((Vehicle.occupied[eid] ?? 0) !== 1) continue;
    const body = PhysicsRef.body[eid] ?? 0;
    if (body === 0) continue;
    ctx.physics.getTransform(body, releasePos, releaseRot);
    const profile = carCatalog[Vehicle.model[eid] ?? 0];
    const shape = profile ? carBody(profile.id) : null;
    const hx = shape?.halfExtents.x ?? sedan.halfExtents.x;
    const hz = shape?.halfExtents.z ?? sedan.halfExtents.z;
    const push = deepestBox(releasePos.x, releasePos.z, yawFromQuat(releaseRot), hx, hz);
    if (push.depth >= BURY_DEPTH) nudge(ctx, body, push.x, push.z);
  }
  for (const eid of traffic(world)) {
    if ((Traffic.mode[eid] ?? 0) !== MODE_PLAYER) continue;
    const body = PhysicsRef.body[eid] ?? 0;
    if (body === 0) continue;
    const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
    if (!spec) continue;
    ctx.physics.getTransform(body, releasePos, releaseRot);
    const push = deepestBox(
      releasePos.x,
      releasePos.z,
      yawFromQuat(releaseRot),
      spec.width / 2,
      spec.length / 2,
    );
    if (push.depth >= BURY_DEPTH) nudge(ctx, body, push.x, push.z);
  }
}

function nudge(ctx: GameContext, body: number, pushX: number, pushZ: number): void {
  const len = Math.hypot(pushX, pushZ);
  if (len < 0.08) return;
  const scale = len > 0.45 ? 0.45 / len : 1;
  ctx.physics.shiftBody(body, pushX * scale, pushZ * scale);
}

function deepestCircle(
  x: number,
  z: number,
  radius: number,
): { x: number; z: number; depth: number } {
  let bestX = 0;
  let bestZ = 0;
  let best = 0;
  for (const box of buildCostaVerde().colliders) {
    if (box.hy < 0.4) continue;
    if (Math.hypot(box.x - x, box.z - z) > 24 + box.hx + box.hz) continue;
    const push = circleBoxExit(x, z, radius, box.x, box.z, box.hx, box.hz, box.yaw);
    if (push.depth <= best) continue;
    best = push.depth;
    bestX = push.x;
    bestZ = push.z;
  }
  return { x: bestX, z: bestZ, depth: best };
}

function deepestRide(
  ctx: GameContext,
  world: World,
  x: number,
  z: number,
): { x: number; z: number; depth: number } {
  let bestX = 0;
  let bestZ = 0;
  let best = 0;
  const consider = (hx: number, hz: number, yaw: number) => {
    const push = circleBoxExit(x, z, sim.playerRadius, ridePos.x, ridePos.z, hx, hz, yaw);
    if (push.depth <= best) return;
    best = push.depth;
    bestX = push.x;
    bestZ = push.z;
  };
  for (const eid of vehicles(world)) {
    const body = PhysicsRef.body[eid] ?? 0;
    if (body === 0) continue;
    ctx.physics.getTransform(body, ridePos, rideRot);
    const profile = carCatalog[Vehicle.model[eid] ?? 0];
    const shape = profile ? carBody(profile.id) : null;
    consider(
      shape?.halfExtents.x ?? sedan.halfExtents.x,
      shape?.halfExtents.z ?? sedan.halfExtents.z,
      yawFromQuat(rideRot),
    );
  }
  for (const eid of traffic(world)) {
    if ((Traffic.active[eid] ?? 0) === 0) continue;
    const body = PhysicsRef.body[eid] ?? 0;
    if (body === 0) continue;
    const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
    if (!spec) continue;
    ctx.physics.getTransform(body, ridePos, rideRot);
    consider(spec.width / 2, spec.length / 2, yawFromQuat(rideRot));
  }
  return { x: bestX, z: bestZ, depth: best };
}

function deepestBox(
  x: number,
  z: number,
  yaw: number,
  hx: number,
  hz: number,
): { x: number; z: number; depth: number } {
  let bestX = 0;
  let bestZ = 0;
  let best = 0;
  for (const box of buildCostaVerde().colliders) {
    if (box.hy < 0.4) continue;
    if (Math.hypot(box.x - x, box.z - z) > 24 + box.hx + box.hz) continue;
    const push = boxExit(x, z, yaw, hx, hz, box.x, box.z, box.yaw, box.hx, box.hz);
    if (push.depth <= best) continue;
    best = push.depth;
    bestX = push.x;
    bestZ = push.z;
  }
  return { x: bestX, z: bestZ, depth: best };
}
