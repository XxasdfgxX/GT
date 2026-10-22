/** Kinematic cars follow lanes, stop on red, and turn dynamic when the player hits them. */

import { buildCostaVerde } from '../../content/city';
import { sampleHeight } from '../../content/map/island-shape';
import { type Exit, exitsAhead, type RoadEdge, type RoadGraph } from '../../content/map/roads';
import { trafficCatalog } from '../../content/traffic-catalog';
import { quatFromYaw } from '../../engine/core/math';
import type { GameContext } from '../context';
import {
  CameraRig,
  Mode,
  Pedestrian,
  PhysicsRef,
  Player,
  RenderRef,
  Traffic,
  TrafficMode,
  Transform,
  Vehicle,
} from '../ecs/components';
import { players, traffic } from '../ecs/queries';
import { TRAFFIC_POOL } from '../features/traffic/pool';
import { bucketCrowd, crowdNear } from '../play/crowd-grid';
import { attachDriver, ejectDriver, releaseDriver, seatDriver } from '../play/drivers';
import { circleHitsBox, TRIP_SECONDS } from '../../sim/overlap';
import { playerFocus } from '../play/player-focus';
import type { World } from 'bitecs';
import { PedState } from '../../sim/ped-ai';
import {
  approachSpeed,
  followSpeed,
  laneOffset,
  lightOpen,
  lightPhase,
  mustYield,
  yieldToPedestrian,
} from '../../sim/traffic-ai';
import { driveStolen } from './traffic-stolen';
import { buildingPush, hitsBuilding, hitsTraffic, spotTaken, unstick } from './traffic-unstick';

export const rot = { x: 0, y: 0, z: 0, w: 1 };

export const pos = { x: 0, y: 0, z: 0 };

export let heading = 0;

let cursor = 0;

let salt = 1;

const BATCH = 8;

export const batchX = new Float32Array(BATCH);

export const batchZ = new Float32Array(BATCH);

export const batchYaw = new Float32Array(BATCH);

export const batchHx = new Float32Array(BATCH);

export const batchHz = new Float32Array(BATCH);

export let batchCount = 0;

export function trafficSystem(ctx: GameContext, world: World): void {
  const graph = buildCostaVerde().graph;
  bucketCrowd(world, ctx.time.tick);
  const dt = ctx.time.fixedDt;
  const phase = lightPhase(ctx.time.tick * dt);
  const focus = playerFocus(world);
  const px = focus.x;
  const pz = focus.z;
  let camYaw = 0;
  let playerSpeed = 0;
  let driving = false;
  let onFoot = false;
  for (const eid of players(world)) {
    camYaw = CameraRig.yaw[eid] ?? 0;
    onFoot = Player.mode[eid] !== Mode.Driving;
    if (Player.mode[eid] === Mode.Driving) {
      driving = true;
      playerSpeed = Math.abs(Vehicle.speed[Player.vehicle[eid] ?? 0] ?? 0);
    }
    break;
  }
  const lookX = -Math.sin(camYaw);
  const lookZ = -Math.cos(camYaw);
  let active = 0;
  for (const eid of traffic(world)) {
    if ((Traffic.active[eid] ?? 0) === 0) continue;
    const dx = (Transform.px[eid] ?? 0) - px;
    const dz = (Transform.pz[eid] ?? 0) - pz;
    const distance = Math.hypot(dx, dz);
    if ((Traffic.mode[eid] ?? 0) === TrafficMode.Wreck) {
      active += 1;
      if (distance > 100) park(ctx, world, eid);
      continue;
    }
    if ((Traffic.mode[eid] ?? 0) === TrafficMode.Player) {
      driveStolen(ctx, world, eid, dt);
      active += 1;
      continue;
    }
    if ((Traffic.mode[eid] ?? 0) === TrafficMode.Parked) {
      active += 1;
      if (distance > 180) park(ctx, world, eid);
      continue;
    }
    if (distance > 230) {
      park(ctx, world, eid);
      continue;
    }
    drive(ctx, world, graph, eid, dt, phase, onFoot ? { x: px, z: pz } : undefined);
    if (driving) hitPlayer(ctx, world, eid, px, pz, playerSpeed);
    active += 1;
  }
  unstick(ctx, world, graph);
  batchCount = 0;
  const target = Math.round(TRAFFIC_POOL * ctx.debug.trafficDensity);
  let guard = 0;
  while (active < target && guard < 8) {
    guard += 1;
    const eid = inactive(world);
    if (eid < 0) break;
    if (!activate(ctx, world, graph, eid, px, pz, lookX, lookZ)) break;
    active += 1;
  }
  ctx.debug.traffic = active;
}

function drive(
  ctx: GameContext,
  world: World,
  graph: RoadGraph,
  eid: number,
  dt: number,
  phase: number,
  onFoot?: { x: number; z: number },
): void {
  const edge = graph.edges[Traffic.edge[eid] ?? 0];
  if (!edge) return;
  const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
  if (!spec) return;
  let gap = 40;
  for (const other of traffic(world)) {
    if (other === eid || (Traffic.active[other] ?? 0) === 0) continue;
    if ((Traffic.edge[other] ?? 0) !== edge.id) continue;
    if ((Traffic.dir[other] ?? 0) !== (Traffic.dir[eid] ?? 0)) continue;
    if ((Traffic.lane[other] ?? 0) !== (Traffic.lane[eid] ?? 0)) continue;
    const ahead = (Traffic.along[other] ?? 0) - (Traffic.along[eid] ?? 0);
    if (ahead > 0 && ahead < gap) gap = ahead;
  }
  let limit = followSpeed(edge.speed, gap, spec.topSpeed);
  const remaining = edge.length - (Traffic.along[eid] ?? 0);
  if (remaining < 14) {
    const a = graph.nodes[edge.a];
    const b = graph.nodes[edge.b];
    if (a && b) {
      const open = lightOpen(b.x - a.x, b.z - a.z, edge.kind, phase);
      const node = (Traffic.dir[eid] ?? 0) === 0 ? b : a;
      if (!open || mustYield(edge.kind, avenueClose(world, graph, node.x, node.z, edge.id))) {
        limit = remaining < 7 ? 0 : limit * 0.35;
      }
    }
  }
  let panic = false;
  if (onFoot) {
    const nodeA = graph.nodes[edge.a];
    const nodeB = graph.nodes[edge.b];
    if (nodeA && nodeB) {
      const fx = (nodeB.x - nodeA.x) / edge.length;
      const fz = (nodeB.z - nodeA.z) / edge.length;
      const dir = Traffic.dir[eid] ?? 0;
      const personCap = yieldToPedestrian(
        Transform.px[eid] ?? 0,
        Transform.pz[eid] ?? 0,
        dir === 0 ? fx : -fx,
        dir === 0 ? fz : -fz,
        onFoot.x,
        onFoot.z,
        spec.width / 2,
        spec.topSpeed,
      );
      panic = personCap === 0;
      limit = Math.min(limit, personCap);
    }
  }
  const speed = Traffic.speed[eid] ?? 0;
  Traffic.speed[eid] = approachSpeed(speed, limit, dt, panic);
  const hx = spec.width / 2;
  const hz = spec.length / 2;
  const hereX = Transform.px[eid] ?? 0;
  const hereZ = Transform.pz[eid] ?? 0;
  const buried = buildingPush(hereX, hereZ, yawOf(eid), hx, hz);
  if (buried.depth > 0.05) {
    Traffic.speed[eid] = 0;
    const nodeA = graph.nodes[edge.a];
    const nodeB = graph.nodes[edge.b];
    let step = -0.45;
    if (nodeA && nodeB && edge.length > 0) {
      const fx = (nodeB.x - nodeA.x) / edge.length;
      const fz = (nodeB.z - nodeA.z) / edge.length;
      const dir = Traffic.dir[eid] ?? 0;
      const travelX = dir === 0 ? fx : -fx;
      const travelZ = dir === 0 ? fz : -fz;
      if (buried.x * travelX + buried.z * travelZ >= 0) step = 0.45;
    }
    const along = (Traffic.along[eid] ?? 0) + step;
    Traffic.along[eid] = Math.max(0, Math.min(edge.length, along));
  } else {
    const speedNow = Traffic.speed[eid] ?? 0;
    if (speedNow > 0 && laneBlocked(world, graph, eid, speedNow * dt)) Traffic.speed[eid] = 0;
    else Traffic.along[eid] = (Traffic.along[eid] ?? 0) + speedNow * dt;
  }
  if ((Traffic.along[eid] ?? 0) >= edge.length - 0.4) {
    const picked = pickNext(graph, edge, Traffic.dir[eid] ?? 0);
    if (!picked) {
      if (!edge.oneWay) {
        Traffic.dir[eid] = (Traffic.dir[eid] ?? 0) === 0 ? 1 : 0;
        Traffic.along[eid] = 1;
      } else {
        // place() would seat a fresh driver in the car that was just put away.
        park(ctx, world, eid);
        return;
      }
    } else {
      Traffic.edge[eid] = picked.edge;
      Traffic.dir[eid] = picked.dir;
      Traffic.along[eid] = 1;
    }
  }
  place(ctx, world, graph, eid);
}

export function place(ctx: GameContext, world: World, graph: RoadGraph, eid: number): void {
  const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
  if (!spec || !measure(graph, eid)) return;
  const body = PhysicsRef.body[eid] ?? 0;
  ctx.physics.setTransform(body, pos, rot);
  const ground = pos.y - spec.height / 2;
  attachDriver(world, eid, pos.x, ground, pos.z, heading, spec.scale);
  seatDriver(world, eid, pos.x, ground, pos.z, heading, spec.scale);
}

function measure(graph: RoadGraph, eid: number): boolean {
  const edge = graph.edges[Traffic.edge[eid] ?? 0];
  const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
  if (!edge || !spec) return false;
  const a = graph.nodes[edge.a];
  const b = graph.nodes[edge.b];
  if (!a || !b) return false;
  const fx = (b.x - a.x) / edge.length;
  const fz = (b.z - a.z) / edge.length;
  const travel =
    (Traffic.dir[eid] ?? 0) === 0
      ? (Traffic.along[eid] ?? 0)
      : edge.length - (Traffic.along[eid] ?? 0);
  const lateral = laneOffset(
    edge.width,
    edge.lanes,
    Traffic.lane[eid] ?? 0,
    Traffic.dir[eid] ?? 0,
    edge.oneWay,
  );
  pos.x = a.x + fx * travel + fz * lateral;
  pos.z = a.z + fz * travel - fx * lateral;
  pos.y = sampleHeight(pos.x, pos.z) + spec.height / 2;
  heading = (Traffic.dir[eid] ?? 0) === 0 ? Math.atan2(fx, fz) : Math.atan2(-fx, -fz);
  quatFromYaw(heading, rot);
  return true;
}

function laneBlocked(world: World, graph: RoadGraph, eid: number, extra: number): boolean {
  const edge = graph.edges[Traffic.edge[eid] ?? 0];
  const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
  if (!edge || !spec) return false;
  const a = graph.nodes[edge.a];
  const b = graph.nodes[edge.b];
  if (!a || !b) return false;
  const fx = (b.x - a.x) / edge.length;
  const fz = (b.z - a.z) / edge.length;
  const lateral = laneOffset(
    edge.width,
    edge.lanes,
    Traffic.lane[eid] ?? 0,
    Traffic.dir[eid] ?? 0,
    edge.oneWay,
  );
  const heading = (Traffic.dir[eid] ?? 0) === 0 ? Math.atan2(fx, fz) : Math.atan2(-fx, -fz);
  const hx = spec.width / 2;
  const hz = spec.length / 2;
  const ahead = (Traffic.along[eid] ?? 0) + extra;
  const aheadTravel = (Traffic.dir[eid] ?? 0) === 0 ? ahead : edge.length - ahead;
  const aheadX = a.x + fx * aheadTravel + fz * lateral;
  const aheadZ = a.z + fz * aheadTravel - fx * lateral;
  if (hitsBuilding(aheadX, aheadZ, heading, hx, hz)) return true;
  if (hitsTraffic(world, eid, aheadX, aheadZ, heading, hx, hz)) return true;
  for (const ped of crowdNear(aheadX, aheadZ, Math.hypot(hx, hz) + 0.35)) {
    if ((Pedestrian.active[ped] ?? 0) === 0 || (Pedestrian.driving[ped] ?? 0) === 1) continue;
    if ((Pedestrian.health[ped] ?? 0) <= 0) continue;
    if (
      !circleHitsBox(
        Transform.px[ped] ?? 0,
        Transform.pz[ped] ?? 0,
        0.35,
        aheadX,
        aheadZ,
        hx,
        hz,
        heading,
      )
    ) {
      continue;
    }
    if (
      (Pedestrian.state[ped] ?? 0) !== PedState.Trip &&
      (Pedestrian.state[ped] ?? 0) !== PedState.Down
    ) {
      Pedestrian.state[ped] = PedState.Trip;
      Pedestrian.wait[ped] = TRIP_SECONDS;
      Pedestrian.speed[ped] = 0;
    }
    return true;
  }
  return false;
}

function hitPlayer(
  ctx: GameContext,
  world: World,
  eid: number,
  playerX: number,
  playerZ: number,
  playerSpeed: number,
): void {
  const dx = (Transform.px[eid] ?? 0) - playerX;
  const dz = (Transform.pz[eid] ?? 0) - playerZ;
  if (dx * dx + dz * dz > 3.3 * 3.3 || playerSpeed < 3) return;
  const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
  const body = PhysicsRef.body[eid] ?? 0;
  ctx.physics.promoteDynamic(body, spec?.mass ?? 400);
  const len = Math.hypot(dx, dz) || 1;
  ctx.physics.applyImpulse(body, {
    x: (dx / len) * playerSpeed * 80,
    y: 20,
    z: (dz / len) * playerSpeed * 80,
  });
  ejectDriver(world, eid, Transform.px[eid] ?? playerX, Transform.pz[eid] ?? playerZ, yawOf(eid));
  Traffic.mode[eid] = TrafficMode.Wreck;
  ctx.events.emit('vehicle:collision', { vehicle: eid, speed: playerSpeed });
}

function activate(
  ctx: GameContext,
  world: World,
  graph: RoadGraph,
  eid: number,
  px: number,
  pz: number,
  lookX: number,
  lookZ: number,
): boolean {
  const edges = graph.edges;
  for (let n = 0; n < edges.length; n += 1) {
    const edge = edges[(cursor + n) % edges.length];
    cursor += 1;
    if (!edge) continue;
    const a = graph.nodes[edge.a];
    const b = graph.nodes[edge.b];
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const dx = mx - px;
    const dz = mz - pz;
    const distance = Math.hypot(dx, dz);
    if (distance < 80 || distance > 200) continue;
    if (dx * lookX + dz * lookZ > 0.2) continue;
    const ground = sampleHeight(mx, mz);
    if (ground < 1) continue;
    salt = (salt * 17 + 5) % 997;
    Traffic.edge[eid] = edge.id;
    Traffic.dir[eid] = edge.oneWay ? 0 : salt % 2;
    Traffic.lane[eid] = edge.lanes > 2 ? salt % 2 : 0;
    Traffic.along[eid] = edge.length * (0.15 + (salt % 40) / 70);
    const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
    if (!spec || !measure(graph, eid)) continue;
    const hx = spec.width / 2;
    const hz = spec.length / 2;
    if (spotTaken(world, eid, hx, hz)) continue;
    Traffic.active[eid] = 1;
    Traffic.mode[eid] = TrafficMode.Drive;
    Traffic.speed[eid] = edge.speed * 0.6;
    const body = PhysicsRef.body[eid] ?? 0;
    const mesh = RenderRef.mesh[eid] ?? 0;
    ctx.physics.setBodyEnabled(body, true);
    ctx.renderer.setMeshVisible(mesh, true);
    place(ctx, world, graph, eid);
    if (batchCount < BATCH) {
      batchX[batchCount] = pos.x;
      batchZ[batchCount] = pos.z;
      batchYaw[batchCount] = heading;
      batchHx[batchCount] = hx;
      batchHz[batchCount] = hz;
      batchCount += 1;
    }
    return true;
  }
  return false;
}

/** Straightest way on at the far node. Right angles count; only a turn back past ~120° does not. */
export function pickNext(
  graph: RoadGraph,
  edge: RoadEdge,
  dir: number,
): { edge: number; dir: number } | undefined {
  let best: Exit | undefined;
  for (const exit of exitsAhead(graph.edges, (id) => graph.nodes[id], edge.id, dir)) {
    if (!best || exit.straightness > best.straightness) best = exit;
  }
  return best && { edge: best.edge, dir: best.dir };
}

function avenueClose(world: World, graph: RoadGraph, x: number, z: number, self: number): boolean {
  for (const other of traffic(world)) {
    if ((Traffic.active[other] ?? 0) === 0) continue;
    const edge = graph.edges[Traffic.edge[other] ?? 0];
    if (!edge || edge.id === self || edge.kind === 'street') continue;
    const dx = (Transform.px[other] ?? 0) - x;
    const dz = (Transform.pz[other] ?? 0) - z;
    if (dx * dx + dz * dz < 14 * 14) return true;
  }
  return false;
}

function inactive(world: World): number {
  for (const eid of traffic(world)) {
    if ((Traffic.active[eid] ?? 0) === 0) return eid;
  }
  return -1;
}

function park(ctx: GameContext, world: World, eid: number): void {
  releaseDriver(world, eid);
  Traffic.active[eid] = 0;
  Traffic.mode[eid] = 0;
  Traffic.speed[eid] = 0;
  const body = PhysicsRef.body[eid] ?? 0;
  ctx.physics.demoteKinematic(body);
  ctx.physics.setBodyEnabled(body, false);
  ctx.renderer.setMeshVisible(RenderRef.mesh[eid] ?? 0, false);
}

export function yawOf(eid: number): number {
  return 2 * Math.atan2(Transform.qy[eid] ?? 0, Transform.qw[eid] ?? 1);
}
