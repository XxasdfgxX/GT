/** Walkers: spawning, chasing, walking the sidewalks and keeping off buildings. */

import type { BoxCollider } from '../../content/map/batch';
import { buildCostaVerde } from '../../content/map/city-data';
import { sampleHeight } from '../../content/map/island-shape';
import { sim } from '../../content/sim';
import { trafficCatalog } from '../../content/traffic-catalog';
import { meshYaw } from '../../game/play/aim-cursor';
import { tallBoxesNear } from '../../game/play/collider-grid';
import { BODY_REACH, circlesOverlap, pinsCircle, sinksDeeper } from '../../game/play/overlap';
import { COUNTER_DAMAGE } from '../../game/systems/ped-ai';
import { boxExit, carBoxesOverlap } from '../../game/systems/traffic-ai';
import { hurtPlayer } from './combat';
import { FIGHT_REACH, type Guy, type Npc, type Room } from './types';

export function spawnNpc(room: Room, clearOfPlayers = 0): void {
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

export function playerWithin(room: Room, x: number, z: number, radius: number): boolean {
  return room.players.some(
    (player) => player.alive && Math.hypot(player.x - x, player.z - z) < radius,
  );
}

export function openSpot(
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

export function npcNear(room: Room, x: number, z: number): boolean {
  for (const npc of room.npcs) {
    if (!npc.alive) continue;
    if (circlesOverlap(x, z, npc.x, npc.z, BODY_REACH)) return true;
  }
  return false;
}

export function chase(room: Room, npc: Npc, player: Guy, dt: number): void {
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

export function walk(room: Room, npc: Npc, dt: number): void {
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

export function slide(
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

export function footBlocked(
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

export let buildingBoxes: readonly BoxCollider[] | null = null;

export function hitsBuilding(x: number, z: number, yaw: number, hx: number, hz: number): boolean {
  buildingBoxes ??= buildCostaVerde().colliders;
  for (const box of tallBoxesNear(buildingBoxes, x, z, Math.hypot(hx, hz))) {
    if (carBoxesOverlap(x, z, yaw, hx, hz, box.x, box.z, box.yaw, box.hx, box.hz)) return true;
  }
  return false;
}

export function roomBuildingPush(
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
