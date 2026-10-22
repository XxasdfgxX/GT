/** Who is in the room: creating it, joining, leaving and names. */

import { sim } from '../../content/sim';
import { type BairroSpawn, findSpawn, pickSpawn, scatterSpawn } from '../../content/spawns';
import type { RoomInfo } from '../protocol';
import { spawnNpc } from './npc';
import { pushLink, releaseCar, spawnCar, toRoad } from './traffic';
import {
  type Car,
  FOOT_SPEED_LIMIT,
  type Guy,
  MAX_PLAYERS,
  REACH_BURST,
  type Room,
  ROOM_CARS,
  ROOM_NPCS,
  type WalkEdge,
  type WalkNode,
} from './types';

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

export const NAME_LIMIT = 16;

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
export function stripControls(value: string): string {
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

export function findPlayer(room: Room, id: number): Guy | undefined {
  return room.players.find((player) => player.id === id);
}

export function findCar(room: Room, id: number): Car | undefined {
  return room.cars.find((car) => car.id === id);
}
