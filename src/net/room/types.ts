/** Room data: limits, room defs, and the shapes every room module shares. */

import { sim } from '../../content/sim';
import type { BairroSpawn } from '../../content/spawns';

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
export const MAX_DIP = 1;

/** Meters past the allowed move that snap the client back to where the server has it. */
export const SNAP_EXCESS = 5;

/** One server tick: a swing that ends between ticks is not late. */
export const PUNCH_SLACK = 0.06;

export const NPC_RESPAWN = 30;

/** A replacement walker appears at least this far from every player. */
export const NPC_RESPAWN_CLEAR = 60;

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

export interface RoadSpan {
  a: number;
  b: number;
  width: number;
  lanes: number;
  speed: number;
  oneWay: boolean;
  length: number;
}

export interface Car {
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

export interface Guy {
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

export interface Npc {
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

export interface Drop {
  id: number;
  x: number;
  y: number;
  z: number;
  amount: number;
  expires: number;
}

export interface Corpse {
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
  /** The full crowd and traffic, at rush hour. The hour sets how many are out. */
  npcCount: number;
  carCount: number;
  /** Car slots (index into the catalog) parked off the map until the streets fill again. */
  carsResting: number[];
  /** Room time of the next step toward the hour's numbers. */
  settleAt: number;
}
