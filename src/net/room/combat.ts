/** Punches, deaths, corpses, cash drops and cars ramming people. */

import { sim } from '../../content/sim';
import { pickSpawn, scatterSpawn } from '../../content/spawns';
import { trafficCatalog } from '../../content/traffic-catalog';
import {
  addCash,
  CORPSE_TIME,
  DROP_LIFETIME,
  dropCash,
  MAX_DROPS,
  NPC_DROP,
  PICKUP_REACH,
  RESPAWN_DELAY,
} from '../../game/play/wallet';
import {
  applyDamage,
  HEAVY_DAMAGE,
  LIGHT_DAMAGE,
  punchHits,
  punchProfile,
} from '../../game/systems/ped-ai';
import { carBoxesOverlap, carImpactDamage } from '../../game/systems/traffic-ai';
import { pushPose } from './movement';
import { spawnNpc } from './npc';
import { findPlayer } from './roster';
import { releaseCar } from './traffic';
import {
  AGGRO_RANGE,
  type Car,
  FOOT_SPEED_LIMIT,
  type Guy,
  type Npc,
  NPC_RESPAWN,
  NPC_RESPAWN_CLEAR,
  type Punch,
  PUNCH_REACH,
  PUNCH_SLACK,
  REACH_BURST,
  type Room,
} from './types';

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

export function hurtPlayer(
  room: Room,
  player: Guy,
  amount: number,
  attackerId: number | null,
): void {
  if (!player.alive || player.car !== 0) return;
  player.health = applyDamage(player.health, amount);
  if (player.health <= 0) killPlayer(room, player, attackerId);
}

export function killPlayer(room: Room, player: Guy, attackerId: number | null): void {
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

export function killNpc(room: Room, npc: Npc, killerId: number): void {
  layCorpse(room, npc.x, npc.y, npc.z, npc.yaw, 1, npc.id);
  npc.alive = false;
  npc.health = 0;
  spawnDrop(room, npc.x, npc.y, npc.z, NPC_DROP);
  const killer = findPlayer(room, killerId);
  if (killer) killer.npcKills += 1;
  room.npcDue.push(room.now + NPC_RESPAWN);
}

/** The room runs for the life of the process, so the dead are replaced, away from players. */
export function replaceFallen(room: Room): void {
  if (room.npcDue.length === 0 || (room.npcDue[0] ?? Infinity) > room.now) return;
  room.npcDue.shift();
  const fallen = room.npcs.findIndex((npc) => !npc.alive);
  if (fallen >= 0) room.npcs.splice(fallen, 1);
  spawnNpc(room, NPC_RESPAWN_CLEAR);
}

export function layCorpse(
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

export function revive(room: Room, player: Guy): void {
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

export function spawnDrop(room: Room, x: number, y: number, z: number, amount: number): void {
  const id = room.nextDrop;
  room.nextDrop += 1;
  room.drops.push({ id, x, y, z, amount, expires: room.now + DROP_LIFETIME });
  // Every snapshot carries every drop, so the oldest go first past the cap.
  if (room.drops.length > MAX_DROPS) room.drops.splice(0, room.drops.length - MAX_DROPS);
}

export function provoked(room: Room, npc: Npc): Guy | undefined {
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

export const RAM_GAP = 0.6;

export function ram(room: Room, car: Car, dt: number): void {
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

export function overlaps(
  car: Car,
  x: number,
  z: number,
  halfWidth: number,
  halfLength: number,
): boolean {
  return carBoxesOverlap(car.x, car.z, car.yaw, halfWidth, halfLength, x, z, 0, 0.35, 0.35);
}
