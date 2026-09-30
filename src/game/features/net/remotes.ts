/** Interpolated ghosts for the other players, the room's npcs, traffic, and cash. */

import {
  characterAlignYaw,
  characterClips,
  characterModel,
  characterScale,
  citizens,
} from '../../../content/models';
import { STREET_LIFT } from '../../../content/map/road-mesh';
import { sim } from '../../../content/sim';
import { trafficCatalog } from '../../../content/traffic-catalog';
import type {
  GameContext,
  NetCar,
  NetNpc,
  NetPickup,
  NetPlayer,
} from '../../../engine/core/context';
import { quatFromYaw } from '../../../engine/core/math';
import type { ClipKey } from '../../../engine/render/renderer';

interface Ghost {
  mesh: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  shown: boolean;
  swing: number;
}

const ghosts = new Map<string, Ghost>();
const seen = new Set<string>();
const rotation = { x: 0, y: 0, z: 0, w: 1 };
const feet = -(sim.playerRadius + sim.playerHalfHeight) + STREET_LIFT;

export function resetRemotes(): void {
  ghosts.clear();
  seen.clear();
}

export function syncRemotes(
  ctx: GameContext,
  players: readonly NetPlayer[],
  npcs: readonly NetNpc[],
  cars: readonly NetCar[],
  pickups: readonly NetPickup[],
  dt: number,
): void {
  seen.clear();
  for (const player of players) {
    if (player.car !== 0) continue;
    const ghost = ensure(ctx, `p${player.id}`, 'player', player.id);
    const moving = ghost.shown && Math.hypot(player.x - ghost.x, player.z - ghost.z) > 0.08;
    const punching = player.swing !== ghost.swing;
    move(ctx, ghost, player.x, player.y, player.z, player.yaw, dt);
    if (punching) ghost.swing = player.swing;
    const clip: ClipKey = punching ? 'punch' : moving ? 'walk' : 'idle';
    ctx.renderer.playClip(ghost.mesh, clip, ghost.swing);
  }
  for (const npc of npcs) {
    const ghost = ensure(ctx, `n${npc.id}`, 'npc', npc.id);
    const moving = ghost.shown && Math.hypot(npc.x - ghost.x, npc.z - ghost.z) > 0.02;
    move(ctx, ghost, npc.x, npc.y, npc.z, npc.yaw, dt);
    ctx.renderer.playClip(ghost.mesh, moving ? 'walk' : 'idle', 0);
  }
  for (const car of cars) {
    if (car.driver !== 0 && car.driver === ctx.net?.selfId) continue;
    const ghost = ensure(ctx, `v${car.id}`, 'car', car.variant);
    move(ctx, ghost, car.x, car.y, car.z, car.yaw, dt);
  }
  for (const drop of pickups) {
    const ghost = ensure(ctx, `c${drop.id}`, 'cash', drop.id);
    move(ctx, ghost, drop.x, drop.y - sim.playerRadius - sim.playerHalfHeight + 0.2, drop.z, 0, dt);
  }
  for (const [key, ghost] of ghosts) {
    if (seen.has(key) || !ghost.shown) continue;
    ghost.shown = false;
    ctx.renderer.setMeshVisible(ghost.mesh, false);
  }
}

function ensure(
  ctx: GameContext,
  key: string,
  kind: 'player' | 'npc' | 'cash' | 'car',
  id: number,
): Ghost {
  seen.add(key);
  const found = ghosts.get(key);
  if (found) return found;
  const mesh =
    kind === 'cash' ? addCash(ctx) : kind === 'car' ? addCar(ctx, id) : addPerson(ctx, kind, id);
  const ghost: Ghost = { mesh, x: 0, y: -40, z: 0, yaw: 0, shown: false, swing: 0 };
  ghosts.set(key, ghost);
  return ghost;
}

function addPerson(ctx: GameContext, kind: 'player' | 'npc', id: number): number {
  const person = kind === 'player' ? null : (citizens[id % citizens.length] ?? citizens[0]);
  return ctx.renderer.addModel({
    url: person?.url ?? characterModel,
    position: { x: 0, y: -40, z: 0 },
    scale: characterScale,
    alignYaw: characterAlignYaw,
    offset: { x: 0, y: feet, z: 0 },
    clips: person?.clips ?? characterClips,
  });
}

function addCar(ctx: GameContext, variant: number): number {
  const spec = trafficCatalog[variant] ?? trafficCatalog[0];
  if (!spec) return addCash(ctx);
  return ctx.renderer.addModel({
    url: spec.url,
    position: { x: 0, y: -40, z: 0 },
    scale: spec.scale,
    offset: { x: 0, y: STREET_LIFT - spec.height / 2, z: 0 },
    tint: spec.color,
  });
}

function addCash(ctx: GameContext): number {
  const mesh = ctx.renderer.addMesh({
    kind: 'box',
    size: { x: 0.38, y: 0.1, z: 0.24 },
    color: 0xf2c14e,
    emissive: 0x8a6a12,
    position: { x: 0, y: -40, z: 0 },
  });
  ctx.renderer.setMeshVisible(mesh, false);
  return mesh;
}

function move(
  ctx: GameContext,
  ghost: Ghost,
  x: number,
  y: number,
  z: number,
  yaw: number,
  dt: number,
): void {
  if (!ghost.shown) {
    ghost.x = x;
    ghost.y = y;
    ghost.z = z;
    ghost.yaw = yaw;
  } else {
    const blend = 1 - Math.exp(-14 * dt);
    ghost.x += (x - ghost.x) * blend;
    ghost.y += (y - ghost.y) * blend;
    ghost.z += (z - ghost.z) * blend;
    ghost.yaw = approachAngle(ghost.yaw, yaw, blend);
  }
  ghost.shown = true;
  quatFromYaw(ghost.yaw, rotation);
  ctx.renderer.setMeshVisible(ghost.mesh, true);
  ctx.renderer.setMeshTransform(ghost.mesh, { x: ghost.x, y: ghost.y, z: ghost.z }, rotation);
}

function approachAngle(from: number, to: number, blend: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * blend;
}
