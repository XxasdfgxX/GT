/** Authoritative room: roster, punches, npc brawls, cash, and respawn. */

import { sampleHeight } from '../content/map/island-shape';
import { pickSpawn, type BairroSpawn } from '../content/spawns';
import { trafficCatalog } from '../content/traffic-catalog';
import { sim } from '../content/sim';
import { NPC_DROP, PICKUP_REACH, RESPAWN_DELAY, addCash, dropCash } from '../game/play/wallet';
import {
  COUNTER_DAMAGE,
  HEAVY_DAMAGE,
  LIGHT_DAMAGE,
  applyDamage,
  punchHits,
} from '../game/systems/ped-ai';
import { approachSpeed, laneOffset, yieldToPedestrian } from '../game/systems/traffic-ai';
import type {
  CarView,
  NpcView,
  PickupView,
  PlayerView,
  RoomInfo,
  RosterEntry,
  SelfView,
} from './protocol';

export const MAX_PLAYERS = 16;
/** Daytime solo crowd: `100 * pedDensity`. */
export const ROOM_NPCS = 100;
/** Same pool as the solo traffic. */
export const ROOM_CARS = 40;
export const PUNCH_REACH = 1.85;
export const FIGHT_REACH = 1.7;
export const AGGRO_RANGE = 9;

export const ROOM_DEFS = [
  { id: 'costa-1', name: 'Costa 1' },
  { id: 'costa-2', name: 'Costa 2' },
  { id: 'costa-3', name: 'Costa 3' },
] as const;

export interface WalkNode {
  id: number;
  x: number;
  z: number;
}

export interface WalkEdge {
  a: number;
  b: number;
  width?: number;
  lanes?: number;
  speed?: number;
  oneWay?: boolean;
  length?: number;
}

interface RoadSpan {
  a: number;
  b: number;
  width: number;
  lanes: number;
  speed: number;
  oneWay: boolean;
  length: number;
}

interface Car {
  id: number;
  edge: number;
  along: number;
  dir: number;
  lane: number;
  variant: number;
  speed: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  driver: number;
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface Punch extends Pose {
  serial: number;
  heavy: boolean;
}

interface Guy {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  cash: number;
  alive: boolean;
  kills: number;
  deaths: number;
  respawn: number;
  lastPunch: number;
  swing: number;
  placeSerial: number;
  place: { x: number; y: number; z: number };
  car: number;
}

interface Npc {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  alive: boolean;
  from: number;
  to: number;
  cool: number;
}

interface Drop {
  id: number;
  x: number;
  y: number;
  z: number;
  amount: number;
}

export interface Room {
  id: string;
  name: string;
  maxPlayers: number;
  spawns: readonly BairroSpawn[];
  nodes: Map<number, WalkNode>;
  links: Map<number, number[]>;
  roads: RoadSpan[];
  rng: () => number;
  players: Guy[];
  npcs: Npc[];
  cars: Car[];
  drops: Drop[];
  nextPlayer: number;
  nextNpc: number;
  nextDrop: number;
}

export function createRoom(options: {
  id: string;
  name: string;
  spawns: readonly BairroSpawn[];
  nodes: readonly WalkNode[];
  edges: readonly WalkEdge[];
  rng: () => number;
  npcCount?: number;
  carCount?: number;
  maxPlayers?: number;
}): Room {
  const nodes = new Map<number, WalkNode>();
  for (const node of options.nodes) nodes.set(node.id, node);
  const links = new Map<number, number[]>();
  for (const edge of options.edges) {
    pushLink(links, edge.a, edge.b);
    pushLink(links, edge.b, edge.a);
  }
  const room: Room = {
    id: options.id,
    name: options.name,
    maxPlayers: options.maxPlayers ?? MAX_PLAYERS,
    spawns: options.spawns,
    nodes,
    links,
    roads: options.edges.flatMap((edge) => toRoad(nodes, edge)),
    rng: options.rng,
    players: [],
    npcs: [],
    cars: [],
    drops: [],
    nextPlayer: 1,
    nextNpc: 1,
    nextDrop: 1,
  };
  const count = options.npcCount ?? ROOM_NPCS;
  for (let i = 0; i < count; i += 1) spawnNpc(room);
  const cars = options.carCount ?? (room.roads.length > 0 ? ROOM_CARS : 0);
  for (let i = 0; i < cars; i += 1) spawnCar(room, i);
  return room;
}

export function listing(room: Room): RoomInfo {
  return { id: room.id, name: room.name, players: room.players.length, max: room.maxPlayers };
}

const NAME_LIMIT = 16;

/** Trimmed display name, or `Player N` when the request is blank. */
export function chooseName(requested: string | undefined, id: number): string {
  const cleaned = stripControls(requested ?? '')
    .trim()
    .slice(0, NAME_LIMIT);
  return cleaned.length > 0 ? cleaned : `Player ${id}`;
}

function stripControls(value: string): string {
  let cleaned = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 31 || code === 127) continue;
    cleaned += char;
  }
  return cleaned;
}

export function join(room: Room, requestedName?: string): number | null {
  if (room.players.length >= room.maxPlayers) return null;
  const id = room.nextPlayer;
  room.nextPlayer += 1;
  const spawn = pickSpawn(room.spawns, room.rng);
  room.players.push({
    id,
    name: chooseName(requestedName, id),
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    yaw: 0,
    health: sim.maxHealth,
    cash: 0,
    alive: true,
    kills: 0,
    deaths: 0,
    respawn: 0,
    lastPunch: 0,
    swing: 0,
    placeSerial: 1,
    place: { x: spawn.x, y: spawn.y, z: spawn.z },
    car: 0,
  });
  return id;
}

export function leave(room: Room, id: number): void {
  const player = findPlayer(room, id);
  if (player) releaseCar(room, player);
  room.players = room.players.filter((person) => person.id !== id);
}

export function pushPose(room: Room, id: number, pose: Pose): void {
  const player = findPlayer(room, id);
  if (!player?.alive) return;
  player.x = pose.x;
  player.y = pose.y;
  player.z = pose.z;
  player.yaw = pose.yaw;
  steerCar(room, player);
}

export function pushPunch(room: Room, id: number, punch: Punch): void {
  const player = findPlayer(room, id);
  if (!player?.alive || punch.serial <= player.lastPunch) return;
  player.lastPunch = punch.serial;
  player.swing += 1;
  pushPose(room, id, punch);
  const damage = punch.heavy ? HEAVY_DAMAGE : LIGHT_DAMAGE;
  for (const other of room.players) {
    if (other.id === id || !other.alive) continue;
    if (!punchHits(player.x, player.z, player.yaw, other.x, other.z, PUNCH_REACH)) continue;
    hurtPlayer(room, other, damage, id);
  }
  for (const npc of room.npcs) {
    if (!npc.alive) continue;
    if (!punchHits(player.x, player.z, player.yaw, npc.x, npc.z, PUNCH_REACH)) continue;
    npc.health = applyDamage(npc.health, damage);
    if (npc.health <= 0) killNpc(room, npc);
  }
}

export function pushPickup(room: Room, id: number, dropId: number): void {
  const player = findPlayer(room, id);
  if (!player?.alive) return;
  const index = room.drops.findIndex((drop) => drop.id === dropId);
  const drop = room.drops[index];
  if (!drop || index < 0) return;
  if (Math.hypot(drop.x - player.x, drop.z - player.z) > PICKUP_REACH) return;
  player.cash = addCash(player.cash, drop.amount);
  room.drops.splice(index, 1);
}

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

export function tick(room: Room, dt: number): void {
  for (const player of room.players) {
    if (player.alive) continue;
    player.respawn -= dt;
    if (player.respawn <= 0) revive(room, player);
  }
  for (const npc of room.npcs) {
    if (!npc.alive) continue;
    npc.cool = Math.max(0, npc.cool - dt);
    const quarry = nearestPlayer(room, npc.x, npc.z);
    if (quarry && Math.hypot(quarry.x - npc.x, quarry.z - npc.z) <= AGGRO_RANGE) {
      chase(room, npc, quarry, dt);
    } else {
      walk(room, npc, dt);
    }
  }
  for (const car of room.cars) driveCar(room, car, dt);
}

export function snapshot(
  room: Room,
  id: number,
): {
  self: SelfView;
  players: PlayerView[];
  npcs: NpcView[];
  cars: CarView[];
  pickups: PickupView[];
  roster: RosterEntry[];
} {
  const player = findPlayer(room, id);
  const self: SelfView = player
    ? {
        health: player.health,
        cash: player.cash,
        alive: player.alive,
        placeSerial: player.placeSerial,
        place: player.place,
        name: player.name,
        kills: player.kills,
        deaths: player.deaths,
        car: player.car,
      }
    : {
        health: 0,
        cash: 0,
        alive: false,
        placeSerial: 0,
        place: { x: 0, y: 0, z: 0 },
        name: '',
        kills: 0,
        deaths: 0,
        car: 0,
      };
  return {
    self,
    roster: room.players.map((person) => ({
      id: person.id,
      name: person.name,
      kills: person.kills,
      deaths: person.deaths,
      alive: person.alive,
    })),
    players: room.players
      .filter((other) => other.id !== id && other.alive)
      .map((other) => ({
        id: other.id,
        name: other.name,
        x: other.x,
        y: other.y,
        z: other.z,
        yaw: other.yaw,
        swing: other.swing,
        car: other.car,
      })),
    npcs: room.npcs
      .filter((npc) => npc.alive)
      .map((npc) => ({
        id: npc.id,
        x: npc.x,
        y: npc.y,
        z: npc.z,
        yaw: npc.yaw,
        health: npc.health,
      })),
    cars: room.cars.map((car) => ({
      id: car.id,
      x: car.x,
      y: car.y,
      z: car.z,
      yaw: car.yaw,
      variant: car.variant,
      driver: car.driver,
    })),
    pickups: room.drops.map((drop) => ({
      id: drop.id,
      x: drop.x,
      y: drop.y,
      z: drop.z,
      amount: drop.amount,
    })),
  };
}

function spawnNpc(room: Room): void {
  const list = [...room.nodes.values()];
  if (list.length === 0) return;
  const origin = list[Math.min(list.length - 1, Math.floor(room.rng() * list.length))];
  if (!origin) return;
  const next = room.links.get(origin.id)?.[0] ?? origin.id;
  const id = room.nextNpc;
  room.nextNpc += 1;
  const y = sampleHeight(origin.x, origin.z) + sim.playerRadius + sim.playerHalfHeight;
  room.npcs.push({
    id,
    x: origin.x,
    y,
    z: origin.z,
    yaw: 0,
    health: sim.maxHealth,
    alive: true,
    from: origin.id,
    to: next,
    cool: 0,
  });
}

function chase(room: Room, npc: Npc, player: Guy, dt: number): void {
  const dx = player.x - npc.x;
  const dz = player.z - npc.z;
  const distance = Math.hypot(dx, dz);
  npc.yaw = Math.atan2(dx, dz);
  if (distance > FIGHT_REACH) {
    slide(npc, dx, dz, distance, 2.6, dt);
    return;
  }
  if (npc.cool > 0) return;
  npc.cool = 1.05;
  hurtPlayer(room, player, COUNTER_DAMAGE, null);
}

function walk(room: Room, npc: Npc, dt: number): void {
  const target = room.nodes.get(npc.to);
  if (!target) return;
  const dx = target.x - npc.x;
  const dz = target.z - npc.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.6) {
    const previous = npc.from;
    npc.from = npc.to;
    const links = room.links.get(npc.to) ?? [];
    npc.to = links.find((id) => id !== previous) ?? links[0] ?? npc.to;
    return;
  }
  npc.yaw = Math.atan2(dx, dz);
  slide(npc, dx, dz, distance, 1.35, dt);
}

function slide(
  npc: Npc,
  dx: number,
  dz: number,
  distance: number,
  speed: number,
  dt: number,
): void {
  if (distance < 1e-4) return;
  const step = Math.min(distance, speed * dt);
  npc.x += (dx / distance) * step;
  npc.z += (dz / distance) * step;
  npc.y = sampleHeight(npc.x, npc.z) + sim.playerRadius + sim.playerHalfHeight;
}

function hurtPlayer(room: Room, player: Guy, amount: number, attackerId: number | null): void {
  if (!player.alive) return;
  player.health = applyDamage(player.health, amount);
  if (player.health <= 0) killPlayer(room, player, attackerId);
}

function killPlayer(room: Room, player: Guy, attackerId: number | null): void {
  releaseCar(room, player);
  const dropped = dropCash(player.cash);
  if (dropped.dropped > 0) spawnDrop(room, player.x, player.y, player.z, dropped.dropped);
  player.cash = dropped.balance;
  player.health = 0;
  player.alive = false;
  player.deaths += 1;
  player.respawn = RESPAWN_DELAY;
  if (attackerId === null) return;
  const attacker = findPlayer(room, attackerId);
  if (attacker) attacker.kills += 1;
}

function killNpc(room: Room, npc: Npc): void {
  npc.alive = false;
  npc.health = 0;
  spawnDrop(room, npc.x, npc.y, npc.z, NPC_DROP);
}

function revive(room: Room, player: Guy): void {
  const spawn = pickSpawn(room.spawns, room.rng);
  player.alive = true;
  player.health = sim.maxHealth;
  player.cash = 0;
  player.respawn = 0;
  player.x = spawn.x;
  player.y = spawn.y;
  player.z = spawn.z;
  player.placeSerial += 1;
  player.place = { x: spawn.x, y: spawn.y, z: spawn.z };
}

function spawnDrop(room: Room, x: number, y: number, z: number, amount: number): void {
  const id = room.nextDrop;
  room.nextDrop += 1;
  room.drops.push({ id, x, y, z, amount });
}

function nearestPlayer(room: Room, x: number, z: number): Guy | undefined {
  let best: Guy | undefined;
  let bestDistance = Infinity;
  for (const player of room.players) {
    if (!player.alive) continue;
    const distance = Math.hypot(player.x - x, player.z - z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = player;
    }
  }
  return best;
}

function findPlayer(room: Room, id: number): Guy | undefined {
  return room.players.find((player) => player.id === id);
}

function findCar(room: Room, id: number): Car | undefined {
  return room.cars.find((car) => car.id === id);
}

function steerCar(room: Room, player: Guy): void {
  if (player.car === 0) return;
  const car = findCar(room, player.car);
  if (!car || car.driver !== player.id) return;
  car.x = player.x;
  car.y = player.y;
  car.z = player.z;
  car.yaw = player.yaw;
}

function releaseCar(room: Room, player: Guy): void {
  if (player.car === 0) return;
  const car = findCar(room, player.car);
  player.car = 0;
  if (!car || car.driver !== player.id) return;
  car.driver = 0;
  parkOnRoad(room, car);
}

function parkOnRoad(room: Room, car: Car): void {
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

function wrapAngle(delta: number): number {
  let turn = delta;
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  return turn;
}

function pushLink(links: Map<number, number[]>, from: number, to: number): void {
  const list = links.get(from);
  if (list) list.push(to);
  else links.set(from, [to]);
}

function toRoad(nodes: Map<number, WalkNode>, edge: WalkEdge): RoadSpan[] {
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

function spawnCar(room: Room, index: number): void {
  if (room.roads.length === 0) return;
  const edge = Math.min(room.roads.length - 1, Math.floor(room.rng() * room.roads.length));
  const span = room.roads[edge];
  const spec = trafficCatalog[index % trafficCatalog.length];
  if (!span || !spec) return;
  const lanes = Math.max(1, span.oneWay ? span.lanes : Math.floor(span.lanes / 2));
  const car: Car = {
    id: index + 1,
    edge,
    along: room.rng() * span.length,
    dir: span.oneWay || room.rng() < 0.5 ? 0 : 1,
    lane: Math.min(lanes - 1, Math.floor(room.rng() * lanes)),
    variant: index % trafficCatalog.length,
    speed: span.speed,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    driver: 0,
  };
  placeCar(room, car);
  room.cars.push(car);
}

function driveCar(room: Room, car: Car, dt: number): void {
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
    car.speed = approachSpeed(car.speed, limit, dt, panic);
  }
  car.along += car.speed * dt;
  if (car.along >= span.length) {
    const arrived = car.dir === 0 ? span.b : span.a;
    const next = pickExit(room, car.edge, arrived);
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

function pickExit(
  room: Room,
  fromEdge: number,
  nodeId: number,
): { edge: number; dir: number } | null {
  const options: { edge: number; dir: number }[] = [];
  for (let index = 0; index < room.roads.length; index += 1) {
    const span = room.roads[index];
    if (!span) continue;
    if (span.a === nodeId) options.push({ edge: index, dir: 0 });
    if (span.b === nodeId && !span.oneWay) options.push({ edge: index, dir: 1 });
  }
  const forward = options.filter((option) => option.edge !== fromEdge);
  const pool = forward.length > 0 ? forward : options;
  const choice = pool[Math.min(pool.length - 1, Math.floor(room.rng() * pool.length))];
  return choice ?? null;
}

function placeCar(room: Room, car: Car): void {
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
