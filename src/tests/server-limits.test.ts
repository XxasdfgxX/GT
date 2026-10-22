import { describe, expect, it } from 'vitest';
import { sampleHeight } from '../content/map/island-shape';
import { sim } from '../content/sim';
import { HEAVY_DAMAGE, LIGHT_DAMAGE } from '../game/systems/ped-ai';
import {
  DEFAULT_ORIGINS,
  MESSAGE_BURST,
  MESSAGE_RATE,
  clientAddress,
  createBucket,
  createSocketCounter,
  originAllowed,
} from '../net/limits';
import { parseServerMessage } from '../net/protocol';
import {
  DROP_LIFETIME,
  FOOT_SPEED_LIMIT,
  MAX_AIR,
  MAX_DROPS,
  NPC_RESPAWN,
  NPC_RESPAWN_CLEAR,
  REACH_BURST,
  chooseName,
  createRoom,
  encodeStates,
  join,
  pushPickup,
  pushPose,
  pushPunch,
  snapshot,
  tick,
  type Room,
} from '../net/room';

const spawns = [{ name: 'centro', x: 0, y: 2, z: 0 }];
const nodes = [
  { id: 0, x: 0, z: 0 },
  { id: 1, x: 400, z: 0 },
];
const edges = [{ a: 0, b: 1 }];

function room(options: Partial<Parameters<typeof createRoom>[0]> = {}): Room {
  return createRoom({
    id: 'costa-1',
    name: 'Costa 1',
    spawns,
    nodes,
    edges,
    rng: () => 0.5,
    npcCount: 0,
    carCount: 0,
    maxPlayers: 4,
    ...options,
  });
}

function at(live: Room, id: number): { x: number; z: number } {
  const player = live.players.find((person) => person.id === id);
  if (!player) throw new Error('jogador sumiu');
  return { x: player.x, z: player.z };
}

describe('transport limits', () => {
  it('spends the burst, drops the excess, and refills at the steady rate', () => {
    const bucket = createBucket();
    for (let n = 0; n < MESSAGE_BURST; n += 1) expect(bucket.take(0)).toBe('ok');
    expect(bucket.take(0)).toBe('drop');
    expect(bucket.take(1 / MESSAGE_RATE)).toBe('ok');
  });

  it('closes a socket that keeps flooding', () => {
    const bucket = createBucket(60, 120, 50, 5);
    const verdicts = Array.from({ length: 200 }, () => bucket.take(0));
    expect(verdicts.filter((verdict) => verdict === 'drop').length).toBe(49);
    expect(verdicts.at(-1)).toBe('close');
  });

  it('lets the game page and tools in, and keeps other pages out', () => {
    for (const origin of DEFAULT_ORIGINS) expect(originAllowed(origin, undefined)).toBe(true);
    expect(originAllowed(undefined, undefined)).toBe(true);
    expect(originAllowed('https://evil.example', undefined)).toBe(false);
    expect(originAllowed('http://192.168.0.5:6969', undefined)).toBe(false);
    expect(originAllowed('http://192.168.0.5:6969', ' http://192.168.0.5:6969 , x')).toBe(true);
  });
});

describe('socket caps', () => {
  it('lets one address hold only its share, and frees it on close', () => {
    const counter = createSocketCounter(2, 3);
    expect(counter.admit('a')).toBe(true);
    expect(counter.admit('a')).toBe(true);
    expect(counter.admit('a')).toBe(false);
    expect(counter.admit('b')).toBe(true);
    expect(counter.admit('c')).toBe(false);
    counter.release('a');
    expect(counter.admit('c')).toBe(true);
  });

  it('trusts the forwarded address only from the local proxy', () => {
    expect(clientAddress('127.0.0.1', '203.0.113.9')).toBe('203.0.113.9');
    expect(clientAddress('::1', 'forged, 203.0.113.9')).toBe('203.0.113.9');
    expect(clientAddress('198.51.100.4', '203.0.113.9')).toBe('198.51.100.4');
    expect(clientAddress('127.0.0.1', undefined)).toBe('127.0.0.1');
  });
});

describe('pose limits', () => {
  it('keeps a claimed height near the ground', () => {
    const live = room();
    const id = join(live, 'Ana', 'centro') ?? 0;
    const start = at(live, id);
    pushPose(live, id, { x: start.x, y: 1e6, z: start.z, yaw: 0 });
    const self = live.players.find((person) => person.id === id);
    expect(self?.y).toBeCloseTo(sampleHeight(start.x, start.z) + MAX_AIR, 6);
  });

  it('holds a tripped player where they fell', () => {
    const live = room();
    const id = join(live, 'Ana', 'centro') ?? 0;
    const start = at(live, id);
    const self = live.players.find((person) => person.id === id);
    if (self) self.down = 1;
    pushPose(live, id, { x: start.x + 3, y: 2, z: start.z, yaw: 0 });
    expect(at(live, id)).toEqual(start);
  });

  it('turns a teleport into one burst of running and snaps the client back', () => {
    const live = room();
    const id = join(live, 'Ana', 'centro') ?? 0;
    const start = at(live, id);
    const serial = snapshot(live, id).self.placeSerial;
    pushPose(live, id, { x: 300, y: 2, z: 0, yaw: 0 });
    const after = at(live, id);
    expect(after.x - start.x).toBeLessThanOrEqual(FOOT_SPEED_LIMIT * REACH_BURST + 1e-6);
    const self = snapshot(live, id).self;
    expect(self.placeSerial).toBe(serial + 1);
    expect(self.place.x).toBeCloseTo(after.x, 6);
  });

  it('buys no distance by sending poses faster', () => {
    const live = room();
    const id = join(live, 'Ana', 'centro') ?? 0;
    const start = at(live, id);
    for (let n = 0; n < 200; n += 1) {
      pushPose(live, id, { x: at(live, id).x + 1, y: 2, z: 0, yaw: 0 });
    }
    expect(at(live, id).x - start.x).toBeLessThanOrEqual(FOOT_SPEED_LIMIT * REACH_BURST + 1e-6);
  });

  it('lets an honest sprint through untouched', () => {
    const live = room();
    const id = join(live, 'Ana', 'centro') ?? 0;
    const start = at(live, id);
    const serial = snapshot(live, id).self.placeSerial;
    for (let step = 1; step <= 60; step += 1) {
      tick(live, 0.05);
      pushPose(live, id, { x: start.x + sim.sprintSpeed * 0.05 * step, y: 2, z: 0, yaw: 0 });
    }
    expect(at(live, id).x).toBeCloseTo(start.x + sim.sprintSpeed * 3, 6);
    expect(snapshot(live, id).self.placeSerial).toBe(serial);
  });

  it('does not hand over a drop the player only claimed to reach', () => {
    const live = room();
    const id = join(live, 'Ana', 'centro') ?? 0;
    live.drops.push({ id: 99, x: 300, y: 2, z: 0, amount: 50, expires: 1e9 });
    pushPose(live, id, { x: 300, y: 2, z: 0, yaw: 0 });
    pushPickup(live, id, 99);
    expect(snapshot(live, id).self.cash).toBe(0);
  });
});

describe('punch limits', () => {
  /** Attacker 1.2 m behind the victim, facing them. */
  function brawl() {
    const live = room();
    const victim = join(live, 'Bia', 'centro') ?? 0;
    const attacker = join(live, 'Caio', 'centro') ?? 0;
    const place = at(live, victim);
    const pose = { x: place.x, y: 2, z: place.z - 1.2, yaw: Math.PI };
    pushPose(live, attacker, pose);
    const health = () => live.players.find((person) => person.id === victim)?.health ?? -1;
    return { live, attacker, pose, health };
  }

  it('lands one punch from a burst of forty heavies', () => {
    const { live, attacker, pose, health } = brawl();
    for (let serial = 1; serial <= 40; serial += 1) {
      pushPunch(live, attacker, { ...pose, serial, heavy: true });
    }
    expect(health()).toBe(sim.maxHealth - HEAVY_DAMAGE);
  });

  it('lands every punch thrown at the swing rate', () => {
    const { live, attacker, pose, health } = brawl();
    for (let serial = 1; serial <= 3; serial += 1) {
      pushPunch(live, attacker, { ...pose, serial, heavy: false });
      for (let step = 0; step < 9; step += 1) tick(live, 0.05);
    }
    expect(health()).toBe(sim.maxHealth - 3 * LIGHT_DAMAGE);
  });

  it('makes a heavy swing wait its full length before the next punch', () => {
    const { live, attacker, pose, health } = brawl();
    pushPunch(live, attacker, { ...pose, serial: 1, heavy: true });
    for (let step = 0; step < 9; step += 1) tick(live, 0.05);
    pushPunch(live, attacker, { ...pose, serial: 2, heavy: false });
    expect(health()).toBe(sim.maxHealth - HEAVY_DAMAGE);
    for (let step = 0; step < 10; step += 1) tick(live, 0.05);
    pushPunch(live, attacker, { ...pose, serial: 3, heavy: false });
    expect(health()).toBe(sim.maxHealth - HEAVY_DAMAGE - LIGHT_DAMAGE);
  });
});

describe('room upkeep', () => {
  /** Staged: the player is placed beside each walker and punches without waiting. */
  function knockOut(live: Room, id: number, count: number): void {
    let serial = 1;
    for (const npc of live.npcs.slice(0, count)) {
      const pose = { x: npc.x, y: npc.y, z: npc.z - 1.2, yaw: Math.PI };
      pushPose(live, id, pose);
      for (let n = 0; n < 4; n += 1) {
        pushPunch(live, id, { ...pose, serial, heavy: true });
        serial += 1;
      }
    }
  }

  it('replaces a killed walker away from the players', () => {
    const live = room({ npcCount: 1, limits: false });
    const id = join(live, 'Ana', 'centro') ?? 0;
    const first = live.npcs[0]?.id;
    knockOut(live, id, 1);
    pushPose(live, id, { x: 0, y: 2, z: 0, yaw: 0 });
    expect(snapshot(live, id).npcs).toHaveLength(0);
    for (let t = 0; t <= NPC_RESPAWN; t += 0.5) tick(live, 0.5);
    const npcs = snapshot(live, id).npcs;
    expect(npcs).toHaveLength(1);
    expect(npcs[0]?.id).not.toBe(first);
    expect(Math.hypot(npcs[0]?.x ?? 0, npcs[0]?.z ?? 0)).toBeGreaterThanOrEqual(NPC_RESPAWN_CLEAR);
    expect(live.npcs).toHaveLength(1);
  });

  it('lets cash drops expire and caps how many a room keeps', () => {
    const live = room({ npcCount: 80, limits: false });
    const id = join(live, 'Ana', 'centro') ?? 0;
    knockOut(live, id, 80);
    expect(live.drops.length).toBe(MAX_DROPS);
    expect(live.drops.at(-1)?.id).toBe(live.nextDrop - 1);
    for (let t = 0; t <= DROP_LIFETIME; t += 1) tick(live, 1);
    expect(live.drops).toHaveLength(0);
  });

  it('stops a car for someone in the lane without knocking them down', () => {
    const live = room({
      nodes: [nodes[0] ?? { id: 0, x: 0, z: 0 }, { id: 1, x: 8, z: 0 }],
      carCount: 1,
      limits: false,
    });
    const id = join(live, 'Ana', 'centro') ?? 0;
    const car = snapshot(live, id).cars[0];
    if (!car) throw new Error('sem carro');
    pushPose(live, id, { x: car.x + 4, y: car.y, z: car.z, yaw: 0 });
    for (let step = 0; step < 30; step += 1) tick(live, 1 / 30);
    expect(snapshot(live, id).self.down).toBe(0);
  });
});

describe('names and state messages', () => {
  it('cuts long names by character and strips direction marks', () => {
    expect(chooseName(`${'a'.repeat(15)}😀b`, 1)).toBe(`${'a'.repeat(15)}😀`);
    expect(chooseName('Bob‮evil​', 1)).toBe('Bobevil');
    expect(chooseName('‮⁦', 7)).toBe('Player 7');
  });

  it('encodes the same state as the snapshot for every member', () => {
    const live = room({ npcCount: 3, carCount: 2 });
    const ids = [join(live, 'Ana') ?? 0, join(live, 'Bia') ?? 0];
    tick(live, 0.05);
    const states = encodeStates(live, ids);
    for (const id of ids) {
      const text = states.get(id) ?? '';
      expect(JSON.parse(text)).toEqual({ type: 'state', ...snapshot(live, id) });
      expect(parseServerMessage(text)?.type).toBe('state');
    }
  });
});
