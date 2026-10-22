import { describe, expect, it } from 'vitest';
import { buildRoadGraph, SIDEWALK_WIDTH } from '../content/map/roads';
import { trafficCatalog } from '../content/traffic-catalog';
import { carBoxesOverlap } from '../game/systems/traffic-ai';
import { onIsland, zoneAt } from '../content/map/island-shape';
import { bairroSpawns, findSpawn, scatterSpawn, soloSpawn } from '../content/spawns';
import { TRAFFIC_POOL } from '../game/features/traffic/pool';
import {
  addCash,
  dropCash,
  formatCash,
  CORPSE_TIME,
  NPC_DROP,
  PICKUP_REACH,
  RESPAWN_DELAY,
  spendCash,
} from '../game/play/wallet';
import {
  MAX_PLAYERS,
  ROOM_CARS,
  ROOM_DEFS,
  ROOM_NPCS,
  createRoom,
  join,
  type Room,
  leave,
  listing,
  pushEnter,
  pushPickup,
  pushPose,
  pushPunch,
  snapshot,
  tick,
} from '../net/room';
import { parseClientMessage, parseRoomList, parseServerMessage } from '../net/protocol';
import { roomSocketQuery } from '../net/session';
import { npcScoreLine, playerScoreLine } from '../ui/score-line';

const spawns = [
  { name: 'centro', x: 0, y: 2, z: 0 },
  { name: 'sul', x: 10, y: 2, z: 0 },
];

const nodes = [
  { id: 0, x: 0, z: 0 },
  { id: 1, x: 8, z: 0 },
];

const edges = [{ a: 0, b: 1 }];

/**
 * These cases stage a scene: players are placed by pose and punch in a burst.
 * The speed and punch-rate limits have their own tests in server-limits.test.ts.
 */
function room() {
  return createRoom({
    id: 'costa-1',
    name: 'Costa 1',
    spawns,
    nodes,
    edges,
    rng: () => 0,
    limits: false,
    npcCount: 1,
    carCount: 0,
    maxPlayers: 2,
  });
}

function down(live: Room, victim: number, attacker: number): void {
  const place = snapshot(live, victim).self.place;
  const pose = { x: place.x, y: place.y, z: place.z - 1.2, yaw: Math.PI };
  pushPose(live, attacker, pose);
  for (let serial = 1; serial <= 5; serial += 1) {
    pushPunch(live, attacker, { ...pose, serial, heavy: false });
  }
}

describe('bairro spawns', () => {
  it('finds a neighborhood by its exact name', () => {
    const points = bairroSpawns(buildRoadGraph());
    expect(findSpawn(points, 'norte')).toEqual(points.find((point) => point.name === 'norte'));
    expect(findSpawn(points, '')).toBeNull();
    expect(findSpawn(points, 'mar')).toBeNull();
  });

  it('puts one sidewalk point in each neighborhood', () => {
    const points = bairroSpawns(buildRoadGraph());
    expect(points.map((point) => point.name)).toEqual([
      'centro',
      'jurere',
      'norte',
      'leste',
      'sul',
    ]);
    for (const point of points) {
      expect(zoneAt(point.x, point.z)?.name).toBe(point.name);
      expect(onIsland(point.x, point.z)).toBe(true);
      expect(point.y).toBeGreaterThan(1);
    }
  });

  it('stands each neighborhood spawn on a sidewalk, clear of the junction', () => {
    const graph = buildRoadGraph();
    for (const point of bairroSpawns(graph)) {
      let fromAsphalt = Infinity;
      for (const edge of graph.edges) {
        const a = graph.nodes[edge.a];
        const b = graph.nodes[edge.b];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const t = Math.max(
          0,
          Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz)),
        );
        const centerline = Math.hypot(a.x + dx * t - point.x, a.z + dz * t - point.z);
        fromAsphalt = Math.min(fromAsphalt, centerline - edge.width / 2);
      }
      expect(fromAsphalt).toBeGreaterThan(0.3);
      expect(fromAsphalt).toBeLessThan(0.32 + SIDEWALK_WIDTH);
      for (const node of graph.nodes) {
        expect(Math.hypot(node.x - point.x, node.z - point.z)).toBeGreaterThan(9);
      }
    }
  });

  it('keeps the solo start on the origin street', () => {
    const start = soloSpawn();
    expect(start.x).toBe(0);
    expect(start.z).toBe(12);
    expect(start.y).toBeGreaterThan(1);
  });
});

describe('wallet', () => {
  it('adds, refuses a short spend, and drops the whole balance', () => {
    expect(addCash(0, NPC_DROP)).toBe(10);
    expect(addCash(4, 0)).toBe(4);
    expect(spendCash(10, 4)).toEqual({ ok: true, balance: 6 });
    expect(spendCash(3, 4)).toEqual({ ok: false, balance: 3 });
    expect(dropCash(25)).toEqual({ dropped: 25, balance: 0 });
    expect(dropCash(0)).toEqual({ dropped: 0, balance: 0 });
    expect(formatCash(10)).toBe('$ 10');
    expect(PICKUP_REACH).toBe(1.5);
    expect(RESPAWN_DELAY).toBe(1);
  });
});

describe('rooms', () => {
  it('lists three servers and stops at the cap', () => {
    expect(ROOM_DEFS.map((entry) => entry.name)).toEqual(['Costa 1', 'Costa 2', 'Costa 3']);
    expect(MAX_PLAYERS).toBe(16);
    const live = room();
    const first = join(live);
    const second = join(live);
    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(join(live)).toBeNull();
    expect(listing(live)).toEqual({ id: 'costa-1', name: 'Costa 1', players: 2, max: 2 });
    leave(live, first ?? 0);
    expect(listing(live).players).toBe(1);
  });

  it('spawns the same daytime crowd and traffic as solo', () => {
    const live = createRoom({
      id: 'costa-1',
      name: 'Costa 1',
      spawns,
      nodes,
      edges,
      rng: () => 0.25,
      limits: false,
    });
    const id = join(live) ?? 0;
    const view = snapshot(live, id);
    expect(ROOM_NPCS).toBe(100);
    expect(ROOM_CARS).toBe(TRAFFIC_POOL);
    expect(view.npcs).toHaveLength(ROOM_NPCS);
    expect(view.cars).toHaveLength(ROOM_CARS);
    const before = view.cars[0]?.x;
    tick(live, 0.5);
    expect(snapshot(live, id).cars[0]?.x).not.toBe(before);
  });

  it('does not pile cars onto the same point when they spawn together', () => {
    const live = createRoom({
      id: 'costa-1',
      name: 'Costa 1',
      spawns,
      nodes: [
        { id: 0, x: 0, z: 0 },
        { id: 1, x: 400, z: 0 },
      ],
      edges: [{ a: 0, b: 1 }],
      rng: () => 0.2,
      limits: false,
      npcCount: 0,
      carCount: 8,
      maxPlayers: 2,
    });
    const id = join(live) ?? 0;
    const cars = snapshot(live, id).cars;
    expect(cars).toHaveLength(8);
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const aBody = trafficCatalog[a?.variant ?? 0];
        const bBody = trafficCatalog[b?.variant ?? 0];
        if (!a || !b || !aBody || !bBody) continue;
        expect(
          carBoxesOverlap(
            a.x,
            a.z,
            a.yaw,
            aBody.width / 2,
            aBody.length / 2,
            b.x,
            b.z,
            b.yaw,
            bBody.width / 2,
            bBody.length / 2,
          ),
        ).toBe(false);
      }
    }
  });

  it('stops a car when a player stands in the lane ahead', () => {
    const live = createRoom({
      id: 'costa-1',
      name: 'Costa 1',
      spawns,
      nodes,
      edges,
      rng: () => 0,
      limits: false,
      npcCount: 0,
      carCount: 1,
      maxPlayers: 2,
    });
    const id = join(live) ?? 0;
    const car = snapshot(live, id).cars[0];
    expect(car).toBeDefined();
    if (!car) return;
    pushPose(live, id, { x: car.x + 4, y: car.y, z: car.z, yaw: 0 });
    for (let step = 0; step < 30; step += 1) tick(live, 1 / 30);
    expect(Math.abs((snapshot(live, id).cars[0]?.x ?? 0) - car.x)).toBeLessThan(1.5);

    pushPose(live, id, { x: car.x, y: car.y, z: car.z + 12, yaw: 0 });
    const clear = snapshot(live, id).cars[0]?.x ?? car.x;
    tick(live, 0.5);
    expect((snapshot(live, id).cars[0]?.x ?? clear) - clear).toBeGreaterThan(1);
  });

  it('removes a punched npc and leaves $10', () => {
    const live = room();
    const id = join(live) ?? 0;
    const npc = snapshot(live, id).npcs[0];
    expect(npc).toBeDefined();
    if (!npc) return;
    const pose = { x: npc.x, y: npc.y, z: npc.z - 1.2, yaw: Math.PI };
    pushPose(live, id, pose);
    for (let serial = 1; serial <= 5; serial += 1) {
      pushPunch(live, id, { ...pose, serial, heavy: false });
    }
    const view = snapshot(live, id);
    expect(view.npcs).toHaveLength(0);
    expect(view.corpses).toEqual([expect.objectContaining({ kind: 1, x: npc.x, z: npc.z })]);
    expect(view.pickups).toEqual([
      expect.objectContaining({ amount: NPC_DROP, x: npc.x, z: npc.z }),
    ]);
    pushPickup(live, id, view.pickups[0]?.id ?? 0);
    expect(snapshot(live, id).self.cash).toBe(NPC_DROP);
    expect(snapshot(live, id).pickups).toHaveLength(0);
    tick(live, CORPSE_TIME - 0.05);
    expect(snapshot(live, id).corpses).toHaveLength(1);
    tick(live, 0.05);
    expect(snapshot(live, id).corpses).toHaveLength(0);
  });

  it('drops carried cash on death and respawns broke at a bairro point', () => {
    const live = room();
    const id = join(live) ?? 0;
    const other = join(live) ?? 0;
    const npc = snapshot(live, id).npcs[0];
    if (!npc) throw new Error('missing npc');
    const pose = { x: npc.x, y: npc.y, z: npc.z - 1.2, yaw: Math.PI };
    pushPose(live, other, { x: 40, y: pose.y, z: 40, yaw: 0 });
    pushPose(live, id, pose);
    for (let serial = 1; serial <= 5; serial += 1) {
      pushPunch(live, id, { ...pose, serial, heavy: false });
    }
    pushPickup(live, id, snapshot(live, id).pickups[0]?.id ?? 0);
    const killer = { x: pose.x, y: pose.y, z: pose.z - 1.2, yaw: Math.PI };
    pushPose(live, other, killer);
    for (let serial = 1; serial <= 5; serial += 1) {
      pushPunch(live, other, { ...killer, serial, heavy: false });
    }
    const dead = snapshot(live, id);
    expect(dead.self.alive).toBe(false);
    expect(dead.self.cash).toBe(0);
    expect(dead.pickups.some((drop) => drop.amount === NPC_DROP)).toBe(true);
    expect(dead.corpses.some((body) => body.kind === 0)).toBe(true);
    expect(snapshot(live, other).players.some((player) => player.id === id)).toBe(false);
    tick(live, RESPAWN_DELAY);
    const back = snapshot(live, id);
    const rolled = scatterSpawn(spawns[0] ?? soloSpawn(), () => 0);
    expect(back.self.alive).toBe(true);
    expect(back.self.cash).toBe(0);
    expect(back.self.health).toBe(10);
    expect(back.self.place).toEqual({ x: rolled.x, y: rolled.y, z: rolled.z });
    expect(back.corpses.some((body) => body.kind === 0)).toBe(true);
  });

  it('respawns a chosen bairro at that same point', () => {
    const live = room();
    const id = join(live, 'Kay', 'sul') ?? 0;
    const other = join(live) ?? 0;
    const sul = scatterSpawn({ name: 'sul', x: 10, y: 2, z: 0 }, () => 0);
    expect(snapshot(live, id).self.place).toEqual({ x: sul.x, y: sul.y, z: sul.z });
    down(live, id, other);
    tick(live, RESPAWN_DELAY);
    expect(snapshot(live, id).self.place).toEqual({ x: sul.x, y: sul.y, z: sul.z });
  });

  it('rerolls when the player did not choose a bairro', () => {
    let call = 0;
    const live = createRoom({
      id: 'costa-1',
      name: 'Costa 1',
      spawns,
      nodes,
      edges,
      rng: () => {
        call += 1;
        if (call === 1) return 0;
        if (call === 6) return 0.6;
        return 0.5;
      },
      limits: false,
      npcCount: 0,
      carCount: 0,
      maxPlayers: 2,
    });
    const centro = scatterSpawn(spawns[0] ?? soloSpawn(), () => 0.5);
    const sul = scatterSpawn(spawns[1] ?? soloSpawn(), () => 0.5);
    const id = join(live) ?? 0;
    const other = join(live, 'Kay', 'sul') ?? 0;
    expect(snapshot(live, id).self.place).toEqual({ x: centro.x, y: centro.y, z: centro.z });
    expect(snapshot(live, other).self.place).toEqual({ x: sul.x, y: sul.y, z: sul.z });
    down(live, id, other);
    tick(live, RESPAWN_DELAY);
    expect(snapshot(live, id).self.place).toEqual({ x: sul.x, y: sul.y, z: sul.z });
    expect(snapshot(live, other).self.place).toEqual({ x: sul.x, y: sul.y, z: sul.z });
  });

  it('adds spawn to the socket query only when a bairro was chosen', () => {
    expect(roomSocketQuery('costa-1', 'Ana', 'sul')).toBe('room=costa-1&name=Ana&spawn=sul');
    expect(roomSocketQuery('costa-1', 'Ana')).toBe('room=costa-1&name=Ana');
  });

  it('rolls when the requested bairro is blank or unknown', () => {
    const blank = room();
    const unknown = room();
    const blankId = join(blank, 'Kay', '') ?? 0;
    const unknownId = join(unknown, 'Kay', 'mar') ?? 0;
    const rolled = scatterSpawn(spawns[0] ?? soloSpawn(), () => 0);
    expect(snapshot(blank, blankId).self.place).toEqual({ x: rolled.x, y: rolled.y, z: rolled.z });
    expect(snapshot(unknown, unknownId).self.place).toEqual({
      x: rolled.x,
      y: rolled.y,
      z: rolled.z,
    });
  });

  it('gives a pickup to the first player in reach', () => {
    const live = room();
    const id = join(live) ?? 0;
    const other = join(live) ?? 0;
    const npc = snapshot(live, id).npcs[0];
    if (!npc) throw new Error('missing npc');
    const pose = { x: npc.x, y: npc.y, z: npc.z - 1.2, yaw: Math.PI };
    pushPose(live, id, pose);
    pushPose(live, other, pose);
    for (let serial = 1; serial <= 5; serial += 1) {
      pushPunch(live, id, { ...pose, serial, heavy: false });
    }
    const drop = snapshot(live, id).pickups[0];
    pushPickup(live, id, drop?.id ?? 0);
    pushPickup(live, other, drop?.id ?? 0);
    expect(snapshot(live, id).self.cash).toBe(NPC_DROP);
    expect(snapshot(live, other).self.cash).toBe(0);
  });

  it('uses the typed name or Player N', () => {
    const live = room();
    const named = join(live, '  Ana Maria dos Santos\n') ?? 0;
    const blank = join(live, ' \t ') ?? 0;
    expect(snapshot(live, named).self.name).toBe('Ana Maria dos Sa');
    expect(snapshot(live, blank).self.name).toBe('Player 2');
    const seen = snapshot(live, blank).players.find((player) => player.id === named);
    expect(seen?.name).toBe('Ana Maria dos Sa');
  });

  it('hurts people on foot with the car and leaves the driver unhurt', () => {
    const live = createRoom({
      id: 'costa-1',
      name: 'Costa 1',
      spawns,
      nodes,
      edges,
      rng: () => 0,
      limits: false,
      npcCount: 1,
      carCount: 1,
      maxPlayers: 2,
    });
    const driver = join(live) ?? 0;
    const walker = join(live) ?? 0;
    const car = snapshot(live, driver).cars[0];
    const npc = snapshot(live, driver).npcs[0];
    if (!car || !npc) throw new Error('missing street');
    const seat = { x: car.x, y: car.y, z: car.z, yaw: car.yaw };
    pushPose(live, driver, seat);
    expect(pushEnter(live, driver, car.id)).toBe(true);
    tick(live, 0.05);
    pushPose(live, walker, { x: npc.x + 6, y: npc.y, z: npc.z, yaw: 0 });
    pushPose(live, driver, { x: npc.x, y: npc.y, z: npc.z, yaw: 0 });
    for (let serial = 1; serial <= 5; serial += 1) {
      pushPunch(live, driver, { x: npc.x, y: npc.y, z: npc.z, yaw: 0, serial, heavy: true });
    }
    expect(snapshot(live, driver).npcs[0]?.health).toBe(10);
    tick(live, 0.1);
    const view = snapshot(live, driver);
    expect(view.self.health).toBe(10);
    expect(view.self.alive).toBe(true);
    expect(view.npcs[0]?.health ?? 0).toBeLessThan(10);
    pushPose(live, driver, { x: npc.x + 6, y: npc.y, z: npc.z, yaw: 0 });
    tick(live, 0.1);
    expect(snapshot(live, walker).self.health).toBeLessThan(10);
    expect(snapshot(live, driver).self.health).toBe(10);
  });

  it('does not damage a player who is driving', () => {
    const live = createRoom({
      id: 'costa-1',
      name: 'Costa 1',
      spawns,
      nodes,
      edges,
      rng: () => 0,
      limits: false,
      npcCount: 1,
      carCount: 1,
      maxPlayers: 2,
    });
    const driver = join(live) ?? 0;
    const puncher = join(live) ?? 0;
    const car = snapshot(live, driver).cars[0];
    if (!car) throw new Error('missing car');
    const seat = { x: car.x, y: car.y, z: car.z, yaw: car.yaw };
    pushPose(live, driver, seat);
    expect(pushEnter(live, driver, car.id)).toBe(true);
    const hit = { x: seat.x, y: seat.y, z: seat.z - 1.2, yaw: Math.PI };
    pushPose(live, puncher, hit);
    for (let serial = 1; serial <= 5; serial += 1) {
      pushPunch(live, puncher, { ...hit, serial, heavy: false });
    }
    tick(live, 2);
    const view = snapshot(live, driver);
    expect(view.self.car).toBe(car.id);
    expect(view.self.alive).toBe(true);
    expect(view.self.health).toBe(10);
  });

  it('counts a player kill and keeps the dead player on the roster', () => {
    const live = room();
    const victim = join(live, 'Vic') ?? 0;
    const killer = join(live, 'Kay') ?? 0;
    const pose = { x: 30, y: 2, z: 0, yaw: 0 };
    const hit = { x: 30, y: 2, z: pose.z - 1.2, yaw: Math.PI };
    pushPose(live, victim, pose);
    pushPose(live, killer, hit);
    for (let serial = 1; serial <= 5; serial += 1) {
      pushPunch(live, killer, { ...hit, serial, heavy: false });
    }
    const view = snapshot(live, killer);
    expect(view.self).toMatchObject({
      name: 'Kay',
      kills: 1,
      npcKills: 0,
      deaths: 0,
      playerDeaths: 0,
      npcDeaths: 0,
    });
    expect(view.roster).toEqual([
      expect.objectContaining({
        id: victim,
        name: 'Vic',
        kills: 0,
        npcKills: 0,
        deaths: 1,
        playerDeaths: 1,
        npcDeaths: 0,
        alive: false,
      }),
      expect.objectContaining({
        id: killer,
        name: 'Kay',
        kills: 1,
        npcKills: 0,
        deaths: 0,
        playerDeaths: 0,
        npcDeaths: 0,
        alive: true,
      }),
    ]);
    expect(view.players.some((player) => player.id === victim || player.id === killer)).toBe(false);
  });

  it('counts an npc kill as a death only', () => {
    const live = room();
    const id = join(live) ?? 0;
    const npc = snapshot(live, id).npcs[0];
    if (!npc) throw new Error('missing npc');
    const pose = { x: npc.x, y: npc.y, z: npc.z - 1.2, yaw: Math.PI };
    pushPose(live, id, pose);
    pushPunch(live, id, { ...pose, serial: 1, heavy: false });
    tick(live, 0.1);
    for (let step = 0; step < 9; step += 1) tick(live, 1.1);
    const view = snapshot(live, id);
    expect(view.self.alive).toBe(false);
    expect(view.self.kills).toBe(0);
    expect(view.self.npcKills).toBe(0);
    expect(view.self.deaths).toBe(1);
    expect(view.self.playerDeaths).toBe(0);
    expect(view.self.npcDeaths).toBe(1);
    expect(view.roster.find((player) => player.id === id)?.npcDeaths).toBe(1);
  });

  it('counts a knocked-out npc on the puncher', () => {
    const live = room();
    const id = join(live, 'Kay') ?? 0;
    const npc = snapshot(live, id).npcs[0];
    if (!npc) throw new Error('missing npc');
    const pose = { x: npc.x, y: npc.y, z: npc.z - 1.2, yaw: Math.PI };
    pushPose(live, id, pose);
    for (let serial = 1; serial <= 5; serial += 1) {
      pushPunch(live, id, { ...pose, serial, heavy: false });
    }
    const view = snapshot(live, id);
    expect(view.npcs.some((person) => person.id === npc.id)).toBe(false);
    expect(view.self).toMatchObject({ kills: 0, npcKills: 1, playerDeaths: 0, npcDeaths: 0 });
    expect(view.roster.find((player) => player.id === id)).toMatchObject({
      kills: 0,
      npcKills: 1,
      playerDeaths: 0,
      npcDeaths: 0,
    });
  });

  it('hits back only after the player lands a punch', () => {
    const live = room();
    const id = join(live) ?? 0;
    const npc = snapshot(live, id).npcs[0];
    if (!npc) throw new Error('missing npc');
    pushPose(live, id, { x: npc.x, y: npc.y, z: npc.z - 1.2, yaw: Math.PI });
    tick(live, 1.2);
    expect(snapshot(live, id).self.health).toBe(10);
    const moved = snapshot(live, id).npcs[0];
    if (!moved) throw new Error('missing npc');
    const pose = { x: moved.x, y: moved.y, z: moved.z - 1.2, yaw: Math.PI };
    pushPose(live, id, pose);
    pushPunch(live, id, { ...pose, serial: 1, heavy: false });
    tick(live, 0.1);
    expect(snapshot(live, id).self.health).toBeLessThan(10);
  });

  it('shows the other player health', () => {
    const live = room();
    const victim = join(live) ?? 0;
    const puncher = join(live) ?? 0;
    const pose = { x: 30, y: 2, z: 0, yaw: 0 };
    const hit = { x: 30, y: 2, z: pose.z - 1.2, yaw: Math.PI };
    pushPose(live, victim, pose);
    pushPose(live, puncher, hit);
    pushPunch(live, puncher, { ...hit, serial: 1, heavy: false });
    const seen = snapshot(live, puncher).players.find((player) => player.id === victim);
    expect(seen?.health).toBe(snapshot(live, victim).self.health);
    expect(seen?.health).toBeLessThan(10);
  });

  it('keeps two npcs from standing on the same corner', () => {
    const live = createRoom({
      id: 'costa-1',
      name: 'Costa 1',
      spawns,
      nodes,
      edges,
      rng: () => 0,
      limits: false,
      npcCount: 2,
      carCount: 0,
      maxPlayers: 2,
    });
    const id = join(live) ?? 0;
    const crowd = snapshot(live, id).npcs;
    expect(crowd).toHaveLength(2);
    const first = crowd[0];
    const second = crowd[1];
    if (!first || !second) throw new Error('missing npc');
    expect(Math.hypot(first.x - second.x, first.z - second.z)).toBeGreaterThan(0.8);
  });

  it('lets a player step away while still inside an npc', () => {
    const live = room();
    const id = join(live) ?? 0;
    const watcher = join(live) ?? 0;
    const npc = snapshot(live, id).npcs[0];
    if (!npc) throw new Error('missing npc');
    let x = npc.x + 2;
    pushPose(live, id, { x, y: npc.y, z: npc.z, yaw: 0 });
    while (x > npc.x + 0.5) {
      x -= 0.1;
      pushPose(live, id, { x, y: npc.y, z: npc.z, yaw: 0 });
    }
    const buried = snapshot(live, watcher).players.find((person) => person.id === id);
    expect(Math.hypot((buried?.x ?? 0) - npc.x, (buried?.z ?? 0) - npc.z)).toBeLessThan(0.8);
    pushPose(live, id, { x: npc.x + 0.7, y: npc.y, z: npc.z, yaw: 0 });
    const left = snapshot(live, watcher).players.find((person) => person.id === id);
    expect(left?.x).toBeCloseTo(npc.x + 0.7, 5);
  });
});

describe('scoreboard', () => {
  it('writes player and npc rows in portuguese', () => {
    expect(playerScoreLine(1, 0)).toBe('Jogadores: 1 abate, 0 mortes');
    expect(playerScoreLine(2, 1)).toBe('Jogadores: 2 abates, 1 morte');
    expect(npcScoreLine(1, 2)).toBe('NPCs: 1 abate, 2 mortes');
  });
});

describe('protocol', () => {
  it('accepts pose, punch, and pickup messages', () => {
    expect(parseClientMessage('{"type":"pose","x":1,"y":2,"z":3,"yaw":0.5}')).toEqual({
      type: 'pose',
      x: 1,
      y: 2,
      z: 3,
      yaw: 0.5,
    });
    expect(
      parseClientMessage('{"type":"punch","serial":2,"heavy":true,"x":0,"y":1,"z":0,"yaw":0}'),
    ).toEqual({ type: 'punch', serial: 2, heavy: true, x: 0, y: 1, z: 0, yaw: 0 });
    expect(parseClientMessage('{"type":"pickup","id":4}')).toEqual({ type: 'pickup', id: 4 });
    expect(parseClientMessage('nope')).toBeNull();
    expect(parseClientMessage('{"type":"pose"}')).toBeNull();
  });

  it('reads names and the roster on a state message', () => {
    const raw = JSON.stringify({
      type: 'state',
      self: {
        health: 10,
        cash: 0,
        alive: true,
        placeSerial: 1,
        place: { x: 0, y: 1, z: 2 },
        name: 'Kay',
        kills: 1,
        npcKills: 2,
        deaths: 1,
        playerDeaths: 0,
        npcDeaths: 1,
      },
      players: [{ id: 2, x: 1, y: 2, z: 3, yaw: 0, swing: 0, name: 'Vic', health: 7 }],
      npcs: [],
      cars: [],
      pickups: [],
      roster: [
        {
          id: 1,
          name: 'Kay',
          kills: 1,
          npcKills: 2,
          deaths: 1,
          playerDeaths: 0,
          npcDeaths: 1,
          alive: true,
        },
      ],
    });
    expect(parseServerMessage(raw)).toMatchObject({
      type: 'state',
      self: { name: 'Kay', kills: 1, npcKills: 2, deaths: 1, playerDeaths: 0, npcDeaths: 1 },
      players: [{ name: 'Vic', health: 7 }],
      roster: [
        {
          id: 1,
          name: 'Kay',
          kills: 1,
          npcKills: 2,
          deaths: 1,
          playerDeaths: 0,
          npcDeaths: 1,
          alive: true,
        },
      ],
    });
  });

  it('reads a room list', () => {
    expect(parseRoomList([{ id: 'costa-1', name: 'Costa 1', players: 2, max: 16 }])).toEqual([
      { id: 'costa-1', name: 'Costa 1', players: 2, max: 16 },
    ]);
    expect(parseRoomList([{ id: 1 }])).toEqual([]);
  });
});
