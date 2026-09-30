/** Kinematic cars follow lanes, stop on red, and turn dynamic when the player hits them. */

import type { World } from 'bitecs';
import { buildCostaVerde } from '../../content/city';
import { sampleHeight } from '../../content/map/island-shape';
import type { RoadEdge, RoadGraph } from '../../content/map/roads';
import { stepDrivenSpeed } from '../../content/cars';
import { trafficCatalog } from '../../content/traffic-catalog';
import { sedan } from '../../content/vehicles';
import type { GameContext } from '../../engine/core/context';
import { quatFromYaw } from '../../engine/core/math';
import {
  CameraRig,
  InputState,
  Pedestrian,
  PhysicsRef,
  Player,
  RenderRef,
  Traffic,
  Transform,
  Vehicle,
} from '../ecs/components';
import { players, pedestrians, traffic, vehicles } from '../ecs/queries';
import { circleHitsBox, TRIP_SECONDS } from '../play/overlap';
import { PedState } from './ped-ai';
import { enginePlayback } from '../play/feel';
import { attachDriver, ejectDriver, releaseDriver, seatDriver } from './pedestrians';
import { TRAFFIC_POOL } from '../features/traffic/pool';
import { Mode } from './player-movement';
import {
  approachSpeed,
  carBoxesOverlap,
  drivenYawRate,
  followSpeed,
  laneOffset,
  lightOpen,
  mustYield,
  yieldToPedestrian,
} from './traffic-ai';

const rot = { x: 0, y: 0, z: 0, w: 1 };
const pos = { x: 0, y: 0, z: 0 };
let cursor = 0;
let salt = 1;

const MODE_DRIVE = 0;
const MODE_WRECK = 2;
const MODE_PLAYER = 3;
const MODE_PARKED = 4;

export function trafficSystem(ctx: GameContext, world: World): void {
  const graph = buildCostaVerde().graph;
  const dt = ctx.time.fixedDt;
  const phase = Math.floor((ctx.time.tick * dt) / 6) % 2;
  let px = 0;
  let pz = 12;
  let camYaw = 0;
  let playerSpeed = 0;
  let playerX = 0;
  let playerZ = 0;
  let driving = false;
  let onFoot = false;
  for (const eid of players(world)) {
    px = Transform.px[eid] ?? 0;
    pz = Transform.pz[eid] ?? 0;
    camYaw = CameraRig.yaw[eid] ?? 0;
    onFoot = Player.mode[eid] !== Mode.Driving;
    if (Player.mode[eid] === Mode.Driving) {
      driving = true;
      const vehicleEid = Player.vehicle[eid] ?? 0;
      playerX = Transform.px[vehicleEid] ?? px;
      playerZ = Transform.pz[vehicleEid] ?? pz;
      playerSpeed = Math.abs(Vehicle.speed[vehicleEid] ?? 0);
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
    if ((Traffic.mode[eid] ?? 0) === MODE_WRECK) {
      active += 1;
      if (distance > 100) park(ctx, world, eid);
      continue;
    }
    if ((Traffic.mode[eid] ?? 0) === MODE_PLAYER) {
      driveStolen(ctx, world, eid, dt);
      active += 1;
      continue;
    }
    if ((Traffic.mode[eid] ?? 0) === MODE_PARKED) {
      active += 1;
      if (distance > 180) park(ctx, world, eid);
      continue;
    }
    if (distance > 230) {
      park(ctx, world, eid);
      continue;
    }
    drive(ctx, world, graph, eid, dt, phase, onFoot ? { x: px, z: pz } : undefined);
    if (driving) hitPlayer(ctx, world, eid, playerX, playerZ, playerSpeed);
    active += 1;
  }
  unstick(ctx, world, graph);
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
  if (hitsBuilding(Transform.px[eid] ?? 0, Transform.pz[eid] ?? 0, yawOf(eid), hx, hz)) {
    Traffic.speed[eid] = 0;
    Traffic.along[eid] = Math.max(0, (Traffic.along[eid] ?? 0) - 0.45);
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
      } else park(ctx, world, eid);
    } else {
      Traffic.edge[eid] = picked.edge;
      Traffic.dir[eid] = picked.dir;
      Traffic.along[eid] = 1;
    }
  }
  place(ctx, world, graph, eid);
}

function place(ctx: GameContext, world: World, graph: RoadGraph, eid: number): void {
  const edge = graph.edges[Traffic.edge[eid] ?? 0];
  const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
  if (!edge || !spec) return;
  const a = graph.nodes[edge.a];
  const b = graph.nodes[edge.b];
  if (!a || !b) return;
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
  const heading = (Traffic.dir[eid] ?? 0) === 0 ? Math.atan2(fx, fz) : Math.atan2(-fx, -fz);
  quatFromYaw(heading, rot);
  const body = PhysicsRef.body[eid] ?? 0;
  ctx.physics.setTransform(body, pos, rot);
  const ground = pos.y - spec.height / 2;
  attachDriver(world, eid, pos.x, ground, pos.z, heading, spec.scale);
  seatDriver(world, eid, pos.x, ground, pos.z, heading, spec.scale);
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
  for (const ped of pedestrians(world)) {
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
  Traffic.mode[eid] = MODE_WRECK;
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
    Traffic.active[eid] = 1;
    Traffic.mode[eid] = MODE_DRIVE;
    Traffic.edge[eid] = edge.id;
    Traffic.dir[eid] = edge.oneWay ? 0 : salt % 2;
    Traffic.lane[eid] = edge.lanes > 2 ? salt % 2 : 0;
    Traffic.along[eid] = edge.length * (0.15 + (salt % 40) / 70);
    Traffic.speed[eid] = edge.speed * 0.6;
    const body = PhysicsRef.body[eid] ?? 0;
    const mesh = RenderRef.mesh[eid] ?? 0;
    ctx.physics.setBodyEnabled(body, true);
    ctx.renderer.setMeshVisible(mesh, true);
    place(ctx, world, graph, eid);
    return true;
  }
  return false;
}

function pickNext(
  graph: RoadGraph,
  edge: RoadEdge,
  dir: number,
): { edge: number; dir: number } | undefined {
  const nodeId = dir === 0 ? edge.b : edge.a;
  const a = graph.nodes[edge.a];
  const b = graph.nodes[edge.b];
  const node = graph.nodes[nodeId];
  if (!a || !b || !node) return undefined;
  const fx = dir === 0 ? (b.x - a.x) / edge.length : (a.x - b.x) / edge.length;
  const fz = dir === 0 ? (b.z - a.z) / edge.length : (a.z - b.z) / edge.length;
  let best = -1;
  let bestDot = 0.2;
  let bestDir = 0;
  for (const other of graph.edges) {
    if (other.id === edge.id) continue;
    let nextDir = -1;
    let ox = 0;
    let oz = 0;
    if (other.a === nodeId) {
      nextDir = 0;
      const end = graph.nodes[other.b];
      if (!end) continue;
      ox = end.x - node.x;
      oz = end.z - node.z;
    } else if (other.b === nodeId && !other.oneWay) {
      nextDir = 1;
      const end = graph.nodes[other.a];
      if (!end) continue;
      ox = end.x - node.x;
      oz = end.z - node.z;
    }
    if (nextDir < 0) continue;
    const len = Math.hypot(ox, oz) || 1;
    const dot = (ox / len) * fx + (oz / len) * fz;
    if (dot > bestDot) {
      bestDot = dot;
      best = other.id;
      bestDir = nextDir;
    }
  }
  if (best < 0) return undefined;
  return { edge: best, dir: bestDir };
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
  ctx.physics.setBodyEnabled(PhysicsRef.body[eid] ?? 0, false);
  ctx.renderer.setMeshVisible(RenderRef.mesh[eid] ?? 0, false);
}

function driveStolen(ctx: GameContext, world: World, eid: number, dt: number): void {
  const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
  if (!spec) return;
  let throttle = 0;
  let brake = 0;
  let steer = 0;
  let handbrake = false;
  for (const player of players(world)) {
    if ((Player.vehicle[player] ?? 0) !== eid) continue;
    throttle = InputState.throttle[player] ?? 0;
    brake = InputState.brake[player] ?? 0;
    steer = InputState.steer[player] ?? 0;
    handbrake = InputState.handbrake[player] === 1;
    break;
  }
  let speed = stepDrivenSpeed(
    Traffic.speed[eid] ?? 0,
    { throttle, brake, handbrake },
    dt,
    spec.torque,
    spec.maxSpeedKmh,
  );
  Traffic.speed[eid] = speed;
  Vehicle.speed[eid] = speed;
  const yaw =
    yawOf(eid) +
    drivenYawRate(steer, speed, sedan.steerSign) *
      dt *
      (0.65 + Math.min(Math.abs(speed), spec.topSpeed) * 0.1);
  const prevX = Transform.px[eid] ?? 0;
  const prevZ = Transform.pz[eid] ?? 0;
  pos.x = prevX + Math.sin(yaw) * speed * dt;
  pos.z = prevZ + Math.cos(yaw) * speed * dt;
  if (blockedAt(world, eid, pos.x, pos.z, yaw, spec.width / 2, spec.length / 2)) {
    pos.x = prevX;
    pos.z = prevZ;
    speed = 0;
    Traffic.speed[eid] = 0;
    Vehicle.speed[eid] = 0;
  }
  const ground = sampleHeight(pos.x, pos.z);
  pos.y = ground + spec.height / 2;
  quatFromYaw(yaw, rot);
  ctx.physics.setTransform(PhysicsRef.body[eid] ?? 0, pos, rot);
  const tone = enginePlayback(true, speed, Math.abs(throttle));
  ctx.audio.setEngine(tone.frequency, tone.gain);
}

function yawOf(eid: number): number {
  return 2 * Math.atan2(Transform.qy[eid] ?? 0, Transform.qw[eid] ?? 1);
}

const SOLID_CAP = 48;
const solidX = new Float32Array(SOLID_CAP);
const solidZ = new Float32Array(SOLID_CAP);
const solidYaw = new Float32Array(SOLID_CAP);
const solidHx = new Float32Array(SOLID_CAP);
const solidHz = new Float32Array(SOLID_CAP);
const solidEid = new Int16Array(SOLID_CAP);
const solidLock = new Uint8Array(SOLID_CAP);

/** Eases a lane car out of another body. One short step, so a bump does not fling it. */
function unstick(ctx: GameContext, world: World, graph: RoadGraph): void {
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

function gatherSolids(world: World): number {
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
    solidLock[count] = mode === MODE_WRECK || mode === MODE_PLAYER || mode === MODE_PARKED ? 1 : 0;
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

function hitsAnother(index: number, count: number): boolean {
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

function blockedAt(
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
  return hitsBuilding(x, z, yaw, hx, hz);
}

function hitsBuilding(x: number, z: number, yaw: number, hx: number, hz: number): boolean {
  for (const box of buildCostaVerde().colliders) {
    if (box.hy < 0.4) continue;
    if (Math.hypot(box.x - x, box.z - z) > 24 + box.hx + box.hz) continue;
    if (carBoxesOverlap(x, z, yaw, hx, hz, box.x, box.z, box.yaw, box.hx, box.hz)) return true;
  }
  return false;
}

function hitsTraffic(
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
