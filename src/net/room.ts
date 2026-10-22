/** Authoritative room: roster, punches, npc brawls, cash, and respawn. */

import { sampleHeight } from '../content/map/island-shape';
import { buildCostaVerde } from '../content/map/city-data';
import type { BoxCollider } from '../content/map/batch';
import { exitsAhead } from '../content/map/roads';
import { findSpawn, pickSpawn, scatterSpawn, type BairroSpawn } from '../content/spawns';
import { trafficCatalog } from '../content/traffic-catalog';
import { sim } from '../content/sim';
import { meshYaw } from '../game/play/aim-cursor';
import { tallBoxesNear } from '../game/play/collider-grid';
import {
  BODY_REACH,
  TRIP_SECONDS,
  circleHitsBox,
  circlesOverlap,
  pinsCircle,
  sinksDeeper,
} from '../game/play/overlap';
import {
  CORPSE_TIME,
  DROP_LIFETIME,
  MAX_DROPS,
  NPC_DROP,
  PICKUP_REACH,
  RESPAWN_DELAY,
  addCash,
  dropCash,
} from '../game/play/wallet';
import {
  COUNTER_DAMAGE,
  HEAVY_DAMAGE,
  LIGHT_DAMAGE,
  applyDamage,
  punchHits,
  punchProfile,
} from '../game/systems/ped-ai';
import {
  approachSpeed,
  boxExit,
  carBoxesOverlap,
  carImpactDamage,
  laneOffset,
  lightOpen,
  lightPhase,
  steppedAlong,
  yieldToPedestrian,
} from '../game/systems/traffic-ai';
import type {
  CarView,
  CorpseView,
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

/** On foot a body may outrun the sprint a little: jumps, shoves, and late packets. */
export const FOOT_SPEED_LIMIT = sim.sprintSpeed * 1.5;
/** A driven car may beat its catalog top speed by this much. */
export const CAR_SPEED_MARGIN = 1.25;
/** Seconds of movement a client may bank, so jitter does not clip honest poses. */
export const REACH_BURST = 0.5;
/** Meters above the terrain a pose may claim: a jump from a car roof, with slack. */
export const MAX_AIR = 6;
/** Meters below the terrain a pose may claim, for curbs and the beach shelf. */
const MAX_DIP = 1;
/** Meters past the allowed move that snap the client back to where the server has it. */
export const SNAP_EXCESS = 5;
/** One server tick: a swing that ends between ticks is not late. */
const PUNCH_SLACK = 0.06;
export const NPC_RESPAWN = 30;
/** A replacement walker appears at least this far from every player. */
export const NPC_RESPAWN_CLEAR = 60;
export { DROP_LIFETIME, MAX_DROPS };

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
  prevX: number;
  prevZ: number;
  hitAt: Map<string, number>;
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
  npcKills: number;
  deaths: number;
  playerDeaths: number;
  npcDeaths: number;
  respawn: number;
  lastPunch: number;
  swing: number;
  /** Seconds left on the ground after someone runs into this body. */
  down: number;
  placeSerial: number;
  place: { x: number; y: number; z: number };
  /** Set when the player picked a bairro. Empty means each revive rolls again. */
  home: { x: number; y: number; z: number } | null;
  car: number;
  /** Meters this player may still move before the budget refills. */
  reach: number;
  reachAt: number;
  /** Room time when the current swing ends and another punch may land. */
  punchReady: number;
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
  /** Player who landed a punch. 0 until then, so a passerby is left alone. */
  foe: number;
  /** Seconds left on the ground after a player runs into this person. */
  down: number;
}

interface Drop {
  id: number;
  x: number;
  y: number;
  z: number;
  amount: number;
  expires: number;
}

interface Corpse {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 0 is a player. 1 is an npc, and variant picks the citizen model. */
  kind: number;
  variant: number;
  left: number;
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
  corpses: Corpse[];
  nextPlayer: number;
  nextNpc: number;
  nextDrop: number;
  nextCorpse: number;
  now: number;
  /** Speed, reach, and punch-rate checks. Off only for tests that stage a scene. */
  limits: boolean;
  /** Room times when a killed walker is replaced. */
  npcDue: number[];
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
  limits?: boolean;
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
    corpses: [],
    nextPlayer: 1,
    nextNpc: 1,
    nextDrop: 1,
    nextCorpse: 1,
    now: 0,
    limits: options.limits ?? true,
    npcDue: [],
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
  // Cut by code point, so a cut never splits an emoji in half.
  const cleaned = Array.from(stripControls(requested ?? '').trim())
    .slice(0, NAME_LIMIT)
    .join('')
    .trim();
  return cleaned.length > 0 ? cleaned : `Player ${id}`;
}

/** Control characters, plus the invisible and direction marks that can disguise a name. */
function stripControls(value: string): string {
  let cleaned = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 31 || (code >= 127 && code <= 159)) continue;
    if ((code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e)) continue;
    if ((code >= 0x2066 && code <= 0x2069) || code === 0xfeff) continue;
    cleaned += char;
  }
  return cleaned;
}

export function join(room: Room, requestedName?: string, requestedSpawn?: string): number | null {
  if (room.players.length >= room.maxPlayers) return null;
  const id = room.nextPlayer;
  room.nextPlayer += 1;
  const chosen = findSpawn(room.spawns, requestedSpawn ?? '');
  const center = chosen ?? pickSpawn(room.spawns, room.rng);
  const spawn = scatterSpawn(center, room.rng);
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
    npcKills: 0,
    deaths: 0,
    playerDeaths: 0,
    npcDeaths: 0,
    respawn: 0,
    lastPunch: 0,
    swing: 0,
    down: 0,
    placeSerial: 1,
    place: { x: spawn.x, y: spawn.y, z: spawn.z },
    home: chosen ? { x: chosen.x, y: chosen.y, z: chosen.z } : null,
    car: 0,
    reach: FOOT_SPEED_LIMIT * REACH_BURST,
    reachAt: room.now,
    punchReady: 0,
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
  // A tripped body stays where it fell until it gets up.
  if (room.limits && player.down > 0) return;
  const previousX = player.x;
  const previousZ = player.z;
  const reach = room.limits ? spendReach(room, player, pose) : 1;
  player.x = previousX + (pose.x - previousX) * reach;
  player.z = previousZ + (pose.z - previousZ) * reach;
  player.y = room.limits ? groundedY(player.x, player.z, pose.y) : pose.y;
  player.yaw = pose.yaw;
  const moved = Math.hypot(player.x - previousX, player.z - previousZ);
  if (player.car === 0 && moved > 0.12) {
    for (const other of room.players) {
      if (other.id === id || !other.alive || other.car !== 0) continue;
      if (!pinsCircle(previousX, previousZ, player.x, player.z, other.x, other.z, BODY_REACH)) {
        continue;
      }
      if (other.down > 0) continue;
      player.x = previousX;
      player.z = previousZ;
      other.down = TRIP_SECONDS;
      break;
    }
    for (const npc of room.npcs) {
      if (!npc.alive || npc.down > 0) continue;
      if (!pinsCircle(previousX, previousZ, player.x, player.z, npc.x, npc.z, BODY_REACH)) continue;
      player.x = previousX;
      player.z = previousZ;
      npc.down = TRIP_SECONDS;
      break;
    }
  }
  steerCar(room, player);
}

/** Clamps a claimed height to the terrain. Hits test only x and z, so a body in the sky still hits. */
function groundedY(x: number, z: number, y: number): number {
  const ground = sampleHeight(x, z);
  return Math.min(ground + MAX_AIR, Math.max(ground - MAX_DIP, y));
}

/**
 * Share of the claimed move this player may make, 0 to 1. The budget refills at top
 * speed and holds REACH_BURST seconds of it, so sending poses faster buys no distance.
 */
function spendReach(room: Room, player: Guy, pose: Pose): number {
  const limit = speedLimit(room, player);
  player.reach = Math.min(
    limit * REACH_BURST,
    player.reach + limit * Math.max(0, room.now - player.reachAt),
  );
  player.reachAt = room.now;
  const claimed = Math.hypot(pose.x - player.x, pose.z - player.z);
  if (claimed <= player.reach) {
    player.reach -= claimed;
    return 1;
  }
  const share = player.reach / claimed;
  // A client this far off is cheating or badly out of sync: move it back on screen.
  if (claimed - player.reach > SNAP_EXCESS && player.car === 0) {
    player.placeSerial += 1;
    player.place = {
      x: player.x + (pose.x - player.x) * share,
      y: player.y,
      z: player.z + (pose.z - player.z) * share,
    };
  }
  player.reach = 0;
  return share;
}

function speedLimit(room: Room, player: Guy): number {
  if (player.car === 0) return FOOT_SPEED_LIMIT;
  const car = findCar(room, player.car);
  const spec = car ? trafficCatalog[car.variant] : undefined;
  return ((spec?.maxSpeedKmh ?? 150) / 3.6) * CAR_SPEED_MARGIN;
}

export function pushPunch(room: Room, id: number, punch: Punch): void {
  const player = findPlayer(room, id);
  if (!player?.alive || punch.serial <= player.lastPunch) return;
  player.lastPunch = punch.serial;
  if (room.limits) {
    // One punch per swing. A heavy swing is longer, so it also waits longer after.
    if (room.now < player.punchReady) return;
    player.punchReady = room.now + punchProfile(punch.heavy).duration - PUNCH_SLACK;
  }
  player.swing += 1;
  if (player.car !== 0) return;
  pushPose(room, id, punch);
  const damage = punch.heavy ? HEAVY_DAMAGE : LIGHT_DAMAGE;
  for (const other of room.players) {
    if (other.id === id || !other.alive || other.car !== 0) continue;
    if (!punchHits(player.x, player.z, player.yaw, other.x, other.z, PUNCH_REACH)) continue;
    hurtPlayer(room, other, damage, id);
  }
  for (const npc of room.npcs) {
    if (!npc.alive) continue;
    if (!punchHits(player.x, player.z, player.yaw, npc.x, npc.z, PUNCH_REACH)) continue;
    npc.health = applyDamage(npc.health, damage);
    npc.foe = id;
    if (npc.health <= 0) killNpc(room, npc, id);
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
  room.now += dt;
  room.corpses = room.corpses.filter((body) => {
    body.left -= dt;
    return body.left > 0;
  });
  if (room.drops.some((drop) => drop.expires <= room.now)) {
    room.drops = room.drops.filter((drop) => drop.expires > room.now);
  }
  replaceFallen(room);
  for (const player of room.players) {
    player.down = Math.max(0, player.down - dt);
    if (player.alive) continue;
    player.respawn -= dt;
    if (player.respawn <= 0) revive(room, player);
  }
  for (const npc of room.npcs) {
    if (!npc.alive) continue;
    npc.cool = Math.max(0, npc.cool - dt);
    npc.down = Math.max(0, npc.down - dt);
    if (npc.down > 0) continue;
    const quarry = provoked(room, npc);
    if (quarry) chase(room, npc, quarry, dt);
    else walk(room, npc, dt);
  }
  for (const car of room.cars) {
    driveCar(room, car, dt);
    ram(room, car, dt);
    car.prevX = car.x;
    car.prevZ = car.z;
  }
}

export interface RoomSnapshot {
  self: SelfView;
  players: PlayerView[];
  npcs: NpcView[];
  cars: CarView[];
  pickups: PickupView[];
  corpses: CorpseView[];
  roster: RosterEntry[];
}

type SharedViews = Omit<RoomSnapshot, 'self' | 'players'>;

export function snapshot(room: Room, id: number): RoomSnapshot {
  const { npcs, cars, ...rest } = sharedViews(room);
  return {
    self: selfView(room, id),
    players: otherPlayers(room, id),
    ...nearMember(room, id, npcs, cars),
    ...rest,
  };
}

/** Centimeters: positions on the wire need no more, and 15 digits tripled the message. */
function cm(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Milliradians, for yaw. */
function mrad(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Meters around a member inside which walkers and cars are sent. Past it they are specks in the fog. */
export const INTEREST_RADIUS = 220;

/**
 * The state message for each member. Drops, bodies and the roster are encoded once per
 * tick. Walkers and cars go only to members near them, and a car a player drives goes to
 * everyone, since its driver shows up on the radar.
 */
export function encodeStates(room: Room, ids: Iterable<number>): Map<number, string> {
  const { npcs, cars, ...rest } = sharedViews(room);
  const tail = JSON.stringify(rest).slice(1, -1);
  const messages = new Map<number, string>();
  for (const id of ids) {
    const self = JSON.stringify(selfView(room, id));
    const players = JSON.stringify(otherPlayers(room, id));
    const near = nearMember(room, id, npcs, cars);
    const crowd = JSON.stringify(near.npcs);
    const traffic = JSON.stringify(near.cars);
    messages.set(
      id,
      `{"type":"state","self":${self},"players":${players},"npcs":${crowd},"cars":${traffic},${tail}}`,
    );
  }
  return messages;
}

function nearMember(
  room: Room,
  id: number,
  npcs: SharedViews['npcs'],
  cars: SharedViews['cars'],
): Pick<SharedViews, 'npcs' | 'cars'> {
  const member = findPlayer(room, id);
  if (!member) return { npcs, cars };
  const reach = INTEREST_RADIUS * INTEREST_RADIUS;
  const near = (item: { x: number; z: number }) =>
    (item.x - member.x) ** 2 + (item.z - member.z) ** 2 <= reach;
  return { npcs: npcs.filter(near), cars: cars.filter((car) => car.driver !== 0 || near(car)) };
}

function selfView(room: Room, id: number): SelfView {
  const player = findPlayer(room, id);
  if (!player) {
    return {
      health: 0,
      cash: 0,
      alive: false,
      placeSerial: 0,
      place: { x: 0, y: 0, z: 0 },
      name: '',
      kills: 0,
      npcKills: 0,
      deaths: 0,
      playerDeaths: 0,
      npcDeaths: 0,
      car: 0,
      down: 0,
    };
  }
  return {
    health: player.health,
    cash: player.cash,
    alive: player.alive,
    placeSerial: player.placeSerial,
    place: { x: cm(player.place.x), y: cm(player.place.y), z: cm(player.place.z) },
    name: player.name,
    kills: player.kills,
    npcKills: player.npcKills,
    deaths: player.deaths,
    playerDeaths: player.playerDeaths,
    npcDeaths: player.npcDeaths,
    car: player.car,
    down: cm(player.down),
  };
}

function otherPlayers(room: Room, id: number): PlayerView[] {
  return room.players
    .filter((other) => other.id !== id && other.alive)
    .map((other) => ({
      id: other.id,
      name: other.name,
      x: cm(other.x),
      y: cm(other.y),
      z: cm(other.z),
      yaw: mrad(other.yaw),
      swing: other.swing,
      car: other.car,
      health: other.health,
      down: cm(other.down),
    }));
}

function sharedViews(room: Room): SharedViews {
  return {
    roster: room.players.map((person) => ({
      id: person.id,
      name: person.name,
      kills: person.kills,
      npcKills: person.npcKills,
      deaths: person.deaths,
      playerDeaths: person.playerDeaths,
      npcDeaths: person.npcDeaths,
      alive: person.alive,
    })),
    npcs: room.npcs
      .filter((npc) => npc.alive)
      .map((npc) => ({
        id: npc.id,
        x: cm(npc.x),
        y: cm(npc.y),
        z: cm(npc.z),
        yaw: mrad(npc.yaw),
        health: npc.health,
        down: cm(npc.down),
      })),
    cars: room.cars.map((car) => ({
      id: car.id,
      x: cm(car.x),
      y: cm(car.y),
      z: cm(car.z),
      yaw: mrad(car.yaw),
      variant: car.variant,
      driver: car.driver,
    })),
    pickups: room.drops.map((drop) => ({
      id: drop.id,
      x: cm(drop.x),
      y: cm(drop.y),
      z: cm(drop.z),
      amount: drop.amount,
    })),
    corpses: room.corpses.map((body) => ({
      id: body.id,
      x: cm(body.x),
      y: cm(body.y),
      z: cm(body.z),
      yaw: mrad(body.yaw),
      kind: body.kind,
      variant: body.variant,
    })),
  };
}

function spawnNpc(room: Room, clearOfPlayers = 0): void {
  const list = [...room.nodes.values()];
  if (list.length === 0) return;
  const start = Math.floor(room.rng() * list.length);
  for (let n = 0; n < list.length; n += 1) {
    const origin = list[(start + n) % list.length];
    if (!origin) continue;
    if (clearOfPlayers > 0 && playerWithin(room, origin.x, origin.z, clearOfPlayers)) continue;
    const spot = openSpot(room, origin);
    if (!spot) continue;
    const next = room.links.get(origin.id)?.[0] ?? origin.id;
    const id = room.nextNpc;
    room.nextNpc += 1;
    const y = sampleHeight(spot.x, spot.z) + sim.playerRadius + sim.playerHalfHeight;
    room.npcs.push({
      id,
      x: spot.x,
      y,
      z: spot.z,
      yaw: 0,
      health: sim.maxHealth,
      alive: true,
      from: origin.id,
      to: next,
      cool: 0,
      foe: 0,
      down: 0,
    });
    return;
  }
}

function playerWithin(room: Room, x: number, z: number, radius: number): boolean {
  return room.players.some(
    (player) => player.alive && Math.hypot(player.x - x, player.z - z) < radius,
  );
}

function openSpot(
  room: Room,
  origin: { id: number; x: number; z: number },
): { x: number; z: number } | null {
  if (!npcNear(room, origin.x, origin.z)) return { x: origin.x, z: origin.z };
  const nextId = room.links.get(origin.id)?.[0];
  const next = nextId === undefined ? undefined : room.nodes.get(nextId);
  let sideX = 1;
  let sideZ = 0;
  if (next) {
    const dx = next.x - origin.x;
    const dz = next.z - origin.z;
    const len = Math.hypot(dx, dz) || 1;
    sideX = -dz / len;
    sideZ = dx / len;
  }
  for (let n = 1; n <= 80; n += 1) {
    const side = 4 + Math.ceil(n / 2) * 1.05;
    const sign = n % 2 === 0 ? 1 : -1;
    const nx = origin.x + sideX * side * sign;
    const nz = origin.z + sideZ * side * sign;
    if (!npcNear(room, nx, nz)) return { x: nx, z: nz };
  }
  return null;
}

function npcNear(room: Room, x: number, z: number): boolean {
  for (const npc of room.npcs) {
    if (!npc.alive) continue;
    if (circlesOverlap(x, z, npc.x, npc.z, BODY_REACH)) return true;
  }
  return false;
}

function chase(room: Room, npc: Npc, player: Guy, dt: number): void {
  const dx = player.x - npc.x;
  const dz = player.z - npc.z;
  const distance = Math.hypot(dx, dz);
  npc.yaw = meshYaw(dx, dz);
  if (distance > FIGHT_REACH) {
    slide(room, npc, dx, dz, distance, 2.6, dt);
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
  npc.yaw = meshYaw(dx, dz);
  slide(room, npc, dx, dz, distance, 1.35, dt);
}

function slide(
  room: Room,
  npc: Npc,
  dx: number,
  dz: number,
  distance: number,
  speed: number,
  dt: number,
): void {
  if (distance < 1e-4) return;
  const step = Math.min(distance, speed * dt);
  const x = npc.x + (dx / distance) * step;
  const z = npc.z + (dz / distance) * step;
  if (footBlocked(room, npc.x, npc.z, x, z, npc.id)) return;
  npc.x = x;
  npc.z = z;
  npc.y = sampleHeight(npc.x, npc.z) + sim.playerRadius + sim.playerHalfHeight;
}

function footBlocked(
  room: Room,
  fromX: number,
  fromZ: number,
  x: number,
  z: number,
  self: number,
): boolean {
  for (const player of room.players) {
    if (!player.alive || player.car !== 0 || player.down > 0) continue;
    if (pinsCircle(fromX, fromZ, x, z, player.x, player.z, BODY_REACH)) return true;
  }
  for (const other of room.npcs) {
    if (other.id === self || !other.alive || other.down > 0) continue;
    if (pinsCircle(fromX, fromZ, x, z, other.x, other.z, BODY_REACH)) return true;
  }
  for (const car of room.cars) {
    const spec = trafficCatalog[car.variant];
    if (!spec) continue;
    if (
      sinksDeeper(fromX, fromZ, x, z, car.x, car.z, spec.width / 2, spec.length / 2, car.yaw, 0.35)
    ) {
      return true;
    }
  }
  buildingBoxes ??= buildCostaVerde().colliders;
  for (const box of tallBoxesNear(buildingBoxes, x, z, 0.5)) {
    if (sinksDeeper(fromX, fromZ, x, z, box.x, box.z, box.hx, box.hz, box.yaw, 0.35)) return true;
  }
  return false;
}

let buildingBoxes: readonly BoxCollider[] | null = null;

function hitsBuilding(x: number, z: number, yaw: number, hx: number, hz: number): boolean {
  buildingBoxes ??= buildCostaVerde().colliders;
  for (const box of tallBoxesNear(buildingBoxes, x, z, Math.hypot(hx, hz))) {
    if (carBoxesOverlap(x, z, yaw, hx, hz, box.x, box.z, box.yaw, box.hx, box.hz)) return true;
  }
  return false;
}

function roomBuildingPush(
  x: number,
  z: number,
  yaw: number,
  hx: number,
  hz: number,
): { x: number; z: number; depth: number } {
  buildingBoxes ??= buildCostaVerde().colliders;
  let bestX = 0;
  let bestZ = 0;
  let best = 0;
  for (const box of tallBoxesNear(buildingBoxes, x, z, Math.hypot(hx, hz))) {
    const push = boxExit(x, z, yaw, hx, hz, box.x, box.z, box.yaw, box.hx, box.hz);
    if (push.depth <= best) continue;
    best = push.depth;
    bestX = push.x;
    bestZ = push.z;
  }
  return { x: bestX, z: bestZ, depth: best };
}

function hurtPlayer(room: Room, player: Guy, amount: number, attackerId: number | null): void {
  if (!player.alive || player.car !== 0) return;
  player.health = applyDamage(player.health, amount);
  if (player.health <= 0) killPlayer(room, player, attackerId);
}

function killPlayer(room: Room, player: Guy, attackerId: number | null): void {
  layCorpse(room, player.x, player.y, player.z, player.yaw, 0, 0);
  releaseCar(room, player);
  const dropped = dropCash(player.cash);
  if (dropped.dropped > 0) spawnDrop(room, player.x, player.y, player.z, dropped.dropped);
  player.cash = dropped.balance;
  player.health = 0;
  player.alive = false;
  player.deaths += 1;
  player.respawn = RESPAWN_DELAY;
  if (attackerId === null) {
    player.npcDeaths += 1;
    return;
  }
  player.playerDeaths += 1;
  const attacker = findPlayer(room, attackerId);
  if (attacker) attacker.kills += 1;
}

function killNpc(room: Room, npc: Npc, killerId: number): void {
  layCorpse(room, npc.x, npc.y, npc.z, npc.yaw, 1, npc.id);
  npc.alive = false;
  npc.health = 0;
  spawnDrop(room, npc.x, npc.y, npc.z, NPC_DROP);
  const killer = findPlayer(room, killerId);
  if (killer) killer.npcKills += 1;
  room.npcDue.push(room.now + NPC_RESPAWN);
}

/** The room runs for the life of the process, so the dead are replaced, away from players. */
function replaceFallen(room: Room): void {
  if (room.npcDue.length === 0 || (room.npcDue[0] ?? Infinity) > room.now) return;
  room.npcDue.shift();
  const fallen = room.npcs.findIndex((npc) => !npc.alive);
  if (fallen >= 0) room.npcs.splice(fallen, 1);
  spawnNpc(room, NPC_RESPAWN_CLEAR);
}

function layCorpse(
  room: Room,
  x: number,
  y: number,
  z: number,
  yaw: number,
  kind: number,
  variant: number,
): void {
  const id = room.nextCorpse;
  room.nextCorpse += 1;
  room.corpses.push({ id, x, y, z, yaw, kind, variant, left: CORPSE_TIME });
}

function revive(room: Room, player: Guy): void {
  const home = player.home;
  const center = home
    ? { name: player.name, x: home.x, y: home.y, z: home.z }
    : pickSpawn(room.spawns, room.rng);
  const spawn = scatterSpawn(center, room.rng);
  player.alive = true;
  player.health = sim.maxHealth;
  player.cash = 0;
  player.respawn = 0;
  player.x = spawn.x;
  player.y = spawn.y;
  player.z = spawn.z;
  player.placeSerial += 1;
  player.place = { x: spawn.x, y: spawn.y, z: spawn.z };
  player.reach = FOOT_SPEED_LIMIT * REACH_BURST;
  player.reachAt = room.now;
}

function spawnDrop(room: Room, x: number, y: number, z: number, amount: number): void {
  const id = room.nextDrop;
  room.nextDrop += 1;
  room.drops.push({ id, x, y, z, amount, expires: room.now + DROP_LIFETIME });
  // Every snapshot carries every drop, so the oldest go first past the cap.
  if (room.drops.length > MAX_DROPS) room.drops.splice(0, room.drops.length - MAX_DROPS);
}

function provoked(room: Room, npc: Npc): Guy | undefined {
  if (npc.foe === 0) return undefined;
  const player = findPlayer(room, npc.foe);
  const gone =
    !player?.alive ||
    player.car !== 0 ||
    Math.hypot(player.x - npc.x, player.z - npc.z) > AGGRO_RANGE;
  if (!player || gone) {
    npc.foe = 0;
    return undefined;
  }
  return player;
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
  const spec = trafficCatalog[index % trafficCatalog.length];
  if (!spec) return;
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
    chosen = car;
    if (!carInsideAnother(room, car)) break;
  }
  if (!chosen) return;
  chosen.prevX = chosen.x;
  chosen.prevZ = chosen.z;
  room.cars.push(chosen);
}

function carInsideAnother(room: Room, car: Car): boolean {
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

const RAM_GAP = 0.6;

function ram(room: Room, car: Car, dt: number): void {
  if (car.driver === 0) return;
  const step = Math.hypot(car.x - car.prevX, car.z - car.prevZ);
  const damage = carImpactDamage(dt > 1e-4 ? step / dt : 0);
  const spec = trafficCatalog[car.variant];
  if (!spec || damage <= 0) return;
  const halfWidth = spec.width / 2;
  const halfLength = spec.length / 2;
  // Only the last RAM_GAP matters, and ids only grow, so drop the rest.
  for (const [key, at] of car.hitAt) if (room.now - at >= RAM_GAP) car.hitAt.delete(key);
  for (const npc of room.npcs) {
    if (!npc.alive || !overlaps(car, npc.x, npc.z, halfWidth, halfLength)) continue;
    const key = `n${npc.id}`;
    if (room.now - (car.hitAt.get(key) ?? -999) < RAM_GAP) continue;
    car.hitAt.set(key, room.now);
    npc.health = applyDamage(npc.health, damage);
    if (npc.health <= 0) killNpc(room, npc, car.driver);
  }
  for (const player of room.players) {
    if (!player.alive || player.car !== 0 || player.id === car.driver) continue;
    if (!overlaps(car, player.x, player.z, halfWidth, halfLength)) continue;
    const key = `p${player.id}`;
    if (room.now - (car.hitAt.get(key) ?? -999) < RAM_GAP) continue;
    car.hitAt.set(key, room.now);
    hurtPlayer(room, player, damage, car.driver);
  }
}

function overlaps(car: Car, x: number, z: number, halfWidth: number, halfLength: number): boolean {
  return carBoxesOverlap(car.x, car.z, car.yaw, halfWidth, halfLength, x, z, 0, 0.35, 0.35);
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

function carPathBlocked(room: Room, car: Car, extra: number): boolean {
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
function pickExit(room: Room, fromEdge: number, dir: number): { edge: number; dir: number } | null {
  const exits = exitsAhead(room.roads, (id) => room.nodes.get(id), fromEdge, dir);
  const choice = exits[Math.min(exits.length - 1, Math.floor(room.rng() * exits.length))];
  return choice ? { edge: choice.edge, dir: choice.dir } : null;
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
