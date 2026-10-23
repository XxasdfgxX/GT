/** Room cars: spawning, driving lanes and lights, getting in and out. */

import { sampleHeight } from '../../content/map/island-shape';
import { exitsAhead } from '../../content/map/roads';
import { sim } from '../../content/sim';
import { trafficCatalog } from '../../content/traffic-catalog';
import { circleHitsBox } from '../../sim/overlap';
import {
  approachSpeed,
  carBoxesOverlap,
  laneOffset,
  lightOpen,
  lightPhase,
  steppedAlong,
  yieldToPedestrian,
} from '../../sim/traffic-ai';
import { hitsBuilding, playerWithin, roomBuildingPush } from './npc';
import { findCar, findPlayer } from './roster';
import type { Car, Guy, RoadSpan, Room, WalkEdge, WalkNode } from './types';

export function pushEnter(room: Room, id: number, carId: number): boolean {
  const player = findPlayer(room, id);
  const car = findCar(room, carId);
  if (!player?.alive || !car) return false;
  if (player.car === car.id && car.driver === player.id) return true;
  if (player.car !== 0 || car.driver !== 0) return false;
  if (Math.hypot(car.x - player.x, car.z - player.z) > sim.interactDistance) return false;
  player.car = car.id;
  car.driver = player.id;
  return true;
}

export function pushExit(room: Room, id: number): void {
  const player = findPlayer(room, id);
  if (player) releaseCar(room, player);
}

export function releaseCar(room: Room, player: Guy): void {
  if (player.car === 0) return;
  const car = findCar(room, player.car);
  player.car = 0;
  if (!car || car.driver !== player.id) return;
  car.driver = 0;
  parkOnRoad(room, car);
}

export function parkOnRoad(room: Room, car: Car): void {
  let best = Infinity;
  let edge = car.edge;
  let along = car.along;
  let dir = car.dir;
  for (let index = 0; index < room.roads.length; index += 1) {
    const span = room.roads[index];
    if (!span) continue;
    const a = room.nodes.get(span.a);
    const b = room.nodes.get(span.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1) continue;
    const t = Math.min(1, Math.max(0, ((car.x - a.x) * dx + (car.z - a.z) * dz) / len2));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const distance = Math.hypot(car.x - px, car.z - pz);
    if (distance >= best) continue;
    best = distance;
    edge = index;
    const heading = Math.atan2(dx, dz);
    let nextDir = Math.abs(wrapAngle(heading - car.yaw)) <= Math.PI / 2 ? 0 : 1;
    if (span.oneWay) nextDir = 0;
    const travel = t * span.length;
    dir = nextDir;
    along = nextDir === 0 ? travel : span.length - travel;
  }
  car.edge = edge;
  car.dir = dir;
  car.along = along;
  placeCar(room, car);
}

export function wrapAngle(delta: number): number {
  let turn = delta;
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  return turn;
}

export function pushLink(links: Map<number, number[]>, from: number, to: number): void {
  const list = links.get(from);
  if (list) list.push(to);
  else links.set(from, [to]);
}

export function toRoad(nodes: Map<number, WalkNode>, edge: WalkEdge): RoadSpan[] {
  const a = nodes.get(edge.a);
  const b = nodes.get(edge.b);
  if (!a || !b) return [];
  const length = edge.length ?? Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1) return [];
  return [
    {
      a: edge.a,
      b: edge.b,
      width: edge.width ?? 7.5,
      lanes: edge.lanes ?? 2,
      speed: edge.speed ?? 8,
      oneWay: edge.oneWay ?? false,
      length,
    },
  ];
}

/** Puts car slot `index` on a random lane, `clearOfPlayers` meters from everyone. False if no lane fit. */
export function spawnCar(room: Room, index: number, clearOfPlayers = 0): boolean {
  if (room.roads.length === 0) return false;
  const spec = trafficCatalog[index % trafficCatalog.length];
  if (!spec) return false;
  const gap = spec.length + 2;
  let chosen: Car | undefined;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const edge = Math.min(room.roads.length - 1, Math.floor(room.rng() * room.roads.length));
    const span = room.roads[edge];
    if (!span) continue;
    const lanes = Math.max(1, span.oneWay ? span.lanes : Math.floor(span.lanes / 2));
    const car: Car = {
      id: index + 1,
      edge,
      along: steppedAlong(room.rng() * span.length, span.length, attempt, gap),
      dir: span.oneWay || room.rng() < 0.5 ? 0 : 1,
      lane: Math.min(lanes - 1, Math.floor(room.rng() * lanes)),
      variant: index % trafficCatalog.length,
      speed: span.speed,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      driver: 0,
      prevX: 0,
      prevZ: 0,
      hitAt: new Map(),
    };
    placeCar(room, car);
    if (clearOfPlayers > 0 && playerWithin(room, car.x, car.z, clearOfPlayers)) continue;
    chosen = car;
    if (!carInsideAnother(room, car)) break;
  }
  if (!chosen) return false;
  chosen.prevX = chosen.x;
  chosen.prevZ = chosen.z;
  room.cars.push(chosen);
  return true;
}

export function carInsideAnother(room: Room, car: Car): boolean {
  const spec = trafficCatalog[car.variant];
  if (!spec) return false;
  const hx = spec.width / 2;
  const hz = spec.length / 2;
  for (const other of room.cars) {
    const body = trafficCatalog[other.variant];
    if (!body) continue;
    if (
      carBoxesOverlap(
        car.x,
        car.z,
        car.yaw,
        hx,
        hz,
        other.x,
        other.z,
        other.yaw,
        body.width / 2,
        body.length / 2,
      )
    ) {
      return true;
    }
  }
  return false;
}

export function driveCar(room: Room, car: Car, dt: number): void {
  if (car.driver !== 0) return;
  const span = room.roads[car.edge];
  if (!span) return;
  const a = room.nodes.get(span.a);
  const b = room.nodes.get(span.b);
  const spec = trafficCatalog[car.variant];
  if (a && b && spec) {
    const fx = (b.x - a.x) / span.length;
    const fz = (b.z - a.z) / span.length;
    const forwardX = car.dir === 0 ? fx : -fx;
    const forwardZ = car.dir === 0 ? fz : -fz;
    let limit = Math.min(span.speed, spec.topSpeed);
    let panic = false;
    for (const player of room.players) {
      if (!player.alive) continue;
      const personCap = yieldToPedestrian(
        car.x,
        car.z,
        forwardX,
        forwardZ,
        player.x,
        player.z,
        spec.width / 2,
        spec.topSpeed,
      );
      if (personCap === 0) panic = true;
      limit = Math.min(limit, personCap);
    }
    // The same lights as solo traffic: ease off near a red node, stop short of it.
    const remaining = span.length - car.along;
    if (remaining < 14 && !lightOpen(b.x - a.x, b.z - a.z, 'avenue', lightPhase(room.now))) {
      limit = remaining < 7 ? 0 : limit * 0.35;
    }
    car.speed = approachSpeed(car.speed, limit, dt, panic);
  }
  const body = trafficCatalog[car.variant];
  const buried =
    body && room.roads.length > 2
      ? roomBuildingPush(car.x, car.z, car.yaw, body.width / 2, body.length / 2)
      : { x: 0, z: 0, depth: 0 };
  if (buried.depth > 0.05) {
    car.speed = 0;
    const nodeA = room.nodes.get(span.a);
    const nodeB = room.nodes.get(span.b);
    let step = -0.45;
    if (nodeA && nodeB && span.length > 0) {
      const fx = (nodeB.x - nodeA.x) / span.length;
      const fz = (nodeB.z - nodeA.z) / span.length;
      const travelX = car.dir === 0 ? fx : -fx;
      const travelZ = car.dir === 0 ? fz : -fz;
      if (buried.x * travelX + buried.z * travelZ >= 0) step = 0.45;
    }
    car.along = Math.max(0, Math.min(span.length, car.along + step));
  } else if (car.speed > 0 && carPathBlocked(room, car, car.speed * dt)) car.speed = 0;
  else car.along += car.speed * dt;
  if (car.along >= span.length) {
    const next = pickExit(room, car.edge, car.dir);
    if (next) {
      car.edge = next.edge;
      car.dir = next.dir;
      car.along -= span.length;
    } else {
      if (!span.oneWay) car.dir = car.dir === 0 ? 1 : 0;
      car.along = 0;
    }
  }
  placeCar(room, car);
}

export function carPathBlocked(room: Room, car: Car, extra: number): boolean {
  const savedAlong = car.along;
  const savedX = car.x;
  const savedZ = car.z;
  const savedYaw = car.yaw;
  car.along += extra;
  placeCar(room, car);
  const spec = trafficCatalog[car.variant];
  let blocked = false;
  if (spec) {
    const hx = spec.width / 2;
    const hz = spec.length / 2;
    if (room.roads.length > 2 && hitsBuilding(car.x, car.z, car.yaw, hx, hz)) {
      blocked = true;
    }
    // A look ahead only stops the car. Nobody is knocked over by where it might be.
    for (const npc of room.npcs) {
      if (!npc.alive || npc.down > 0) continue;
      if (circleHitsBox(npc.x, npc.z, 0.35, car.x, car.z, hx, hz, car.yaw)) blocked = true;
    }
    for (const player of room.players) {
      if (!player.alive || player.car !== 0 || player.down > 0) continue;
      if (circleHitsBox(player.x, player.z, 0.35, car.x, car.z, hx, hz, car.yaw)) blocked = true;
    }
  }
  car.along = savedAlong;
  car.x = savedX;
  car.z = savedZ;
  car.yaw = savedYaw;
  return blocked;
}

/** A random way on at the node, never a hairpin: the same turns solo traffic may take. */
export function pickExit(
  room: Room,
  fromEdge: number,
  dir: number,
): { edge: number; dir: number } | null {
  const exits = exitsAhead(room.roads, (id) => room.nodes.get(id), fromEdge, dir);
  const choice = exits[Math.min(exits.length - 1, Math.floor(room.rng() * exits.length))];
  return choice ? { edge: choice.edge, dir: choice.dir } : null;
}

export function placeCar(room: Room, car: Car): void {
  const span = room.roads[car.edge];
  if (!span) return;
  const a = room.nodes.get(span.a);
  const b = room.nodes.get(span.b);
  const spec = trafficCatalog[car.variant];
  if (!a || !b || !spec) return;
  const fx = (b.x - a.x) / span.length;
  const fz = (b.z - a.z) / span.length;
  const travel = car.dir === 0 ? car.along : span.length - car.along;
  const lateral = laneOffset(span.width, span.lanes, car.lane, car.dir, span.oneWay);
  car.x = a.x + fx * travel + fz * lateral;
  car.z = a.z + fz * travel - fx * lateral;
  car.y = sampleHeight(car.x, car.z) + spec.height / 2;
  car.yaw = car.dir === 0 ? Math.atan2(fx, fz) : Math.atan2(-fx, -fz);
}
