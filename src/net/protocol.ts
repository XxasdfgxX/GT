/** JSON messages between the browser and the room server. */

export interface RoomInfo {
  id: string;
  name: string;
  players: number;
  max: number;
}

export interface PoseMsg {
  type: 'pose';
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface PunchMsg {
  type: 'punch';
  serial: number;
  heavy: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface PickupMsg {
  type: 'pickup';
  id: number;
}

export interface EnterMsg {
  type: 'enter';
  id: number;
}

export interface ExitMsg {
  type: 'exit';
}

export type ClientMsg = PoseMsg | PunchMsg | PickupMsg | EnterMsg | ExitMsg;

export interface WelcomeMsg {
  type: 'welcome';
  id: number;
  x: number;
  y: number;
  z: number;
  placeSerial: number;
}

export interface SelfView {
  health: number;
  cash: number;
  alive: boolean;
  placeSerial: number;
  place: { x: number; y: number; z: number };
  name: string;
  kills: number;
  npcKills: number;
  deaths: number;
  playerDeaths: number;
  npcDeaths: number;
  /** 0 on foot. Otherwise the id of the car this player is driving. */
  car: number;
}

export interface RosterEntry {
  id: number;
  name: string;
  kills: number;
  npcKills: number;
  deaths: number;
  playerDeaths: number;
  npcDeaths: number;
  alive: boolean;
}

export interface PlayerView {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  swing: number;
  /** 0 on foot. Otherwise the id of the car this player is driving. */
  car: number;
  health: number;
}

export interface NpcView {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
}

export interface PickupView {
  id: number;
  x: number;
  y: number;
  z: number;
  amount: number;
}

export interface CarView {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  variant: number;
  /** 0 while traffic is driving. Otherwise the player id in the seat. */
  driver: number;
}

export interface CorpseView {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 0 is a player body. 1 is an npc, and variant picks the citizen. */
  kind: number;
  variant: number;
}

export interface StateMsg {
  type: 'state';
  self: SelfView;
  players: PlayerView[];
  npcs: NpcView[];
  cars: CarView[];
  pickups: PickupView[];
  corpses: CorpseView[];
  roster: RosterEntry[];
}

export interface ErrorMsg {
  type: 'error';
  message: string;
}

export type ServerMsg = WelcomeMsg | StateMsg | ErrorMsg;

export function parseClientMessage(raw: string): ClientMsg | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  if (value.type === 'pose') {
    const x = num(value.x);
    const y = num(value.y);
    const z = num(value.z);
    const yaw = num(value.yaw);
    if (x === null || y === null || z === null || yaw === null) return null;
    return { type: 'pose', x, y, z, yaw };
  }
  if (value.type === 'punch') {
    const serial = num(value.serial);
    const x = num(value.x);
    const y = num(value.y);
    const z = num(value.z);
    const yaw = num(value.yaw);
    if (serial === null || !Number.isInteger(serial) || serial <= 0) return null;
    if (typeof value.heavy !== 'boolean') return null;
    if (x === null || y === null || z === null || yaw === null) return null;
    return { type: 'punch', serial, heavy: value.heavy, x, y, z, yaw };
  }
  if (value.type === 'pickup') {
    const id = num(value.id);
    if (id === null || !Number.isInteger(id) || id <= 0) return null;
    return { type: 'pickup', id };
  }
  if (value.type === 'enter') {
    const id = num(value.id);
    if (id === null || !Number.isInteger(id) || id <= 0) return null;
    return { type: 'enter', id };
  }
  if (value.type === 'exit') return { type: 'exit' };
  return null;
}

export function parseRoomList(value: unknown): RoomInfo[] {
  if (!Array.isArray(value)) return [];
  const rooms: RoomInfo[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string') continue;
    const players = num(entry.players);
    const max = num(entry.max);
    if (players === null || max === null) continue;
    rooms.push({ id: entry.id, name: entry.name, players, max });
  }
  return rooms;
}

export function parseServerMessage(raw: string): ServerMsg | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  if (value.type === 'error' && typeof value.message === 'string') {
    return { type: 'error', message: value.message };
  }
  if (value.type === 'welcome') {
    const id = num(value.id);
    const x = num(value.x);
    const y = num(value.y);
    const z = num(value.z);
    const placeSerial = num(value.placeSerial);
    if (id === null || x === null || y === null || z === null || placeSerial === null) return null;
    return { type: 'welcome', id, x, y, z, placeSerial };
  }
  if (value.type === 'state') return parseState(value);
  return null;
}

function parseState(value: Record<string, unknown>): StateMsg | null {
  if (!isRecord(value.self)) return null;
  const health = num(value.self.health);
  const cash = num(value.self.cash);
  const placeSerial = num(value.self.placeSerial);
  const kills = num(value.self.kills);
  const npcKills = countOrZero(value.self.npcKills);
  const deaths = num(value.self.deaths);
  const playerDeaths = countOrZero(value.self.playerDeaths);
  const npcDeaths = countOrZero(value.self.npcDeaths);
  const ride = value.self.car === undefined ? 0 : num(value.self.car);
  if (
    health === null ||
    cash === null ||
    placeSerial === null ||
    kills === null ||
    npcKills === null ||
    deaths === null ||
    playerDeaths === null ||
    npcDeaths === null ||
    ride === null ||
    typeof value.self.alive !== 'boolean' ||
    typeof value.self.name !== 'string'
  ) {
    return null;
  }
  if (!isRecord(value.self.place)) return null;
  const px = num(value.self.place.x);
  const py = num(value.self.place.y);
  const pz = num(value.self.place.z);
  if (px === null || py === null || pz === null) return null;
  if (
    !Array.isArray(value.players) ||
    !Array.isArray(value.npcs) ||
    !Array.isArray(value.cars) ||
    !Array.isArray(value.pickups) ||
    !Array.isArray(value.roster)
  ) {
    return null;
  }
  const players: PlayerView[] = [];
  for (const entry of value.players) {
    const player = parsePlayer(entry);
    if (player) players.push(player);
  }
  const npcs: NpcView[] = [];
  for (const entry of value.npcs) {
    const npc = parseNpc(entry);
    if (npc) npcs.push(npc);
  }
  const cars: CarView[] = [];
  for (const entry of value.cars) {
    const car = parseCar(entry);
    if (car) cars.push(car);
  }
  const pickups: PickupView[] = [];
  for (const entry of value.pickups) {
    const drop = parsePickup(entry);
    if (drop) pickups.push(drop);
  }
  const roster: RosterEntry[] = [];
  for (const entry of value.roster) {
    const person = parseRoster(entry);
    if (person) roster.push(person);
  }
  return {
    type: 'state',
    self: {
      health,
      cash,
      alive: value.self.alive,
      placeSerial,
      place: { x: px, y: py, z: pz },
      name: value.self.name,
      kills,
      npcKills,
      deaths,
      playerDeaths,
      npcDeaths,
      car: ride,
    },
    players,
    npcs,
    cars,
    pickups,
    corpses: parseCorpses(value.corpses),
    roster,
  };
}

function parseCorpses(value: unknown): CorpseView[] {
  if (!Array.isArray(value)) return [];
  const bodies: CorpseView[] = [];
  for (const entry of value) {
    const body = parseCorpse(entry);
    if (body) bodies.push(body);
  }
  return bodies;
}

function parseCorpse(value: unknown): CorpseView | null {
  if (!isRecord(value)) return null;
  const id = num(value.id);
  const x = num(value.x);
  const y = num(value.y);
  const z = num(value.z);
  const yaw = num(value.yaw);
  const kind = num(value.kind);
  const variant = num(value.variant);
  if (
    id === null ||
    x === null ||
    y === null ||
    z === null ||
    yaw === null ||
    kind === null ||
    variant === null
  ) {
    return null;
  }
  return { id, x, y, z, yaw, kind, variant };
}

function parsePlayer(value: unknown): PlayerView | null {
  if (!isRecord(value)) return null;
  const id = num(value.id);
  const x = num(value.x);
  const y = num(value.y);
  const z = num(value.z);
  const yaw = num(value.yaw);
  const swing = num(value.swing);
  if (id === null || x === null || y === null || z === null || yaw === null || swing === null)
    return null;
  if (typeof value.name !== 'string') return null;
  const ride = value.car === undefined ? 0 : num(value.car);
  const health = num(value.health);
  if (ride === null || health === null) return null;
  return { id, name: value.name, x, y, z, yaw, swing, car: ride, health };
}

function parseRoster(value: unknown): RosterEntry | null {
  if (!isRecord(value)) return null;
  const id = num(value.id);
  const kills = num(value.kills);
  const npcKills = countOrZero(value.npcKills);
  const deaths = num(value.deaths);
  const playerDeaths = countOrZero(value.playerDeaths);
  const npcDeaths = countOrZero(value.npcDeaths);
  if (
    id === null ||
    kills === null ||
    npcKills === null ||
    deaths === null ||
    playerDeaths === null ||
    npcDeaths === null
  ) {
    return null;
  }
  if (typeof value.name !== 'string' || typeof value.alive !== 'boolean') return null;
  return {
    id,
    name: value.name,
    kills,
    npcKills,
    deaths,
    playerDeaths,
    npcDeaths,
    alive: value.alive,
  };
}

function parseNpc(value: unknown): NpcView | null {
  if (!isRecord(value)) return null;
  const id = num(value.id);
  const x = num(value.x);
  const y = num(value.y);
  const z = num(value.z);
  const yaw = num(value.yaw);
  const health = num(value.health);
  if (id === null || x === null || y === null || z === null || yaw === null || health === null)
    return null;
  return { id, x, y, z, yaw, health };
}

function parseCar(value: unknown): CarView | null {
  if (!isRecord(value)) return null;
  const id = num(value.id);
  const x = num(value.x);
  const y = num(value.y);
  const z = num(value.z);
  const yaw = num(value.yaw);
  const variant = num(value.variant);
  if (id === null || x === null || y === null || z === null || yaw === null || variant === null)
    return null;
  const driver = value.driver === undefined ? 0 : num(value.driver);
  if (driver === null) return null;
  return { id, x, y, z, yaw, variant, driver };
}

function parsePickup(value: unknown): PickupView | null {
  if (!isRecord(value)) return null;
  const id = num(value.id);
  const x = num(value.x);
  const y = num(value.y);
  const z = num(value.z);
  const amount = num(value.amount);
  if (id === null || x === null || y === null || z === null || amount === null) return null;
  return { id, x, y, z, amount };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Older snapshots omit the split counters. A bad number still rejects the message. */
function countOrZero(value: unknown): number | null {
  if (value === undefined) return 0;
  return num(value);
}
