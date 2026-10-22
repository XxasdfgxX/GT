/** Interpolated ghosts for the other players, the room's npcs, traffic, and cash. */

import {
  characterAlignYaw,
  characterClips,
  characterModel,
  characterScale,
  citizens,
} from '../../../content/models';
import { sampleHeight } from '../../../content/map/island-shape';
import { STREET_LIFT } from '../../../content/map/road-mesh';
import { sim } from '../../../content/sim';
import { trafficCatalog } from '../../../content/traffic-catalog';
import type {
  GameContext,
  NetCar,
  NetCorpse,
  NetNpc,
  NetPickup,
  NetPlayer,
} from '../../../engine/core/context';
import { quatFromYaw, writeTransformMatrix } from '../../../engine/core/math';
import type { ClipKey } from '../../../engine/render/renderer';
import { HURT_SECONDS } from '../../systems/ped-ai';
import { HEALTH_TRACK_WIDTH, PLAYER_BAR_LIFT, carRoofLift, healthFillLayout } from '../health-bar';

interface Ghost {
  mesh: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  shown: boolean;
  swing: number;
  blood: number;
  roof: number;
}

const BAR_CAP = 64;
const ghosts = new Map<string, Ghost>();
const seen = new Set<string>();
const lastHealth = new Map<number, number>();
const hurtUntil = new Map<number, number>();
const rotation = { x: 0, y: 0, z: 0, w: 1 };
const feet = -(sim.playerRadius + sim.playerHalfHeight) + STREET_LIFT;
const barMatrices = new Float32Array(BAR_CAP * 16);
const barFill = new Float32Array(BAR_CAP * 16);
const barColors = new Float32Array(BAR_CAP * 3);
const fillColors = new Float32Array(BAR_CAP * 3);
let clock = 0;
let barMesh = 0;
let fillMesh = 0;

export function remotePlayerMark(
  id: number,
  carId: number,
): { x: number; y: number; z: number; driving: boolean } | null {
  if (carId !== 0) {
    const ghost = ghosts.get(`v${carId}`);
    if (!ghost?.shown) return null;
    return { x: ghost.x, y: ghost.y + ghost.roof, z: ghost.z, driving: true };
  }
  const ghost = ghosts.get(`p${id}`);
  if (!ghost?.shown) return null;
  return { x: ghost.x, y: ghost.y, z: ghost.z, driving: false };
}

export function resetRemotes(): void {
  ghosts.clear();
  seen.clear();
  lastHealth.clear();
  hurtUntil.clear();
  clock = 0;
  barMesh = 0;
  fillMesh = 0;
}

export function syncRemotes(
  ctx: GameContext,
  players: readonly NetPlayer[],
  npcs: readonly NetNpc[],
  cars: readonly NetCar[],
  pickups: readonly NetPickup[],
  corpses: readonly NetCorpse[],
  cameraYaw: number,
  dt: number,
): void {
  seen.clear();
  clock += dt;
  for (const player of players) {
    if (player.car !== 0) continue;
    const ghost = ensure(ctx, `p${player.id}`, 'player', player.id);
    const moving = ghost.shown && Math.hypot(player.x - ghost.x, player.z - ghost.z) > 0.08;
    const punching = player.swing !== ghost.swing;
    move(ctx, ghost, player.x, player.y, player.z, player.yaw, dt);
    if (punching) ghost.swing = player.swing;
    const clip: ClipKey = player.down > 0 ? 'die' : punching ? 'punch' : moving ? 'walk' : 'idle';
    ctx.renderer.playClip(ghost.mesh, clip, player.down > 0 ? 1 : ghost.swing);
  }
  for (const npc of npcs) {
    const ghost = ensure(ctx, `n${npc.id}`, 'npc', npc.id);
    const moving = ghost.shown && Math.hypot(npc.x - ghost.x, npc.z - ghost.z) > 0.02;
    move(ctx, ghost, npc.x, npc.y, npc.z, npc.yaw, dt);
    ctx.renderer.playClip(
      ghost.mesh,
      npc.down > 0 ? 'die' : moving ? 'walk' : 'idle',
      npc.down > 0 ? 1 : 0,
    );
    const previous = lastHealth.get(npc.id);
    if (previous !== undefined && npc.health < previous)
      hurtUntil.set(npc.id, clock + HURT_SECONDS);
    lastHealth.set(npc.id, npc.health);
  }
  syncBars(ctx, players, npcs, cameraYaw);
  for (const car of cars) {
    if (car.driver !== 0 && car.driver === ctx.net?.selfId) continue;
    const ghost = ensure(ctx, `v${car.id}`, 'car', car.variant);
    move(ctx, ghost, car.x, car.y, car.z, car.yaw, dt);
  }
  for (const drop of pickups) {
    const ghost = ensure(ctx, `c${drop.id}`, 'cash', drop.id);
    move(ctx, ghost, drop.x, drop.y - sim.playerRadius - sim.playerHalfHeight + 0.2, drop.z, 0, dt);
  }
  for (const body of corpses) {
    const ghost = ensure(ctx, `d${body.id}`, 'corpse', body.variant);
    move(ctx, ghost, body.x, body.y, body.z, body.yaw, dt, true);
    ctx.renderer.playClip(ghost.mesh, 'die', 1);
    parkBlood(ctx, ghost.blood, body.x, body.z, body.yaw);
  }
  for (const [key, ghost] of ghosts) {
    if (seen.has(key) || !ghost.shown) continue;
    ghost.shown = false;
    ctx.renderer.setMeshVisible(ghost.mesh, false);
    if (ghost.blood !== 0) ctx.renderer.setMeshVisible(ghost.blood, false);
  }
}

function ensure(
  ctx: GameContext,
  key: string,
  kind: 'player' | 'npc' | 'cash' | 'car' | 'corpse',
  id: number,
): Ghost {
  seen.add(key);
  const found = ghosts.get(key);
  if (found) return found;
  const mesh =
    kind === 'cash'
      ? addCash(ctx)
      : kind === 'car'
        ? addCar(ctx, id)
        : addPerson(ctx, kind === 'player' ? 'player' : 'npc', id);
  const blood = kind === 'corpse' ? addBlood(ctx) : 0;
  const roof = kind === 'car' ? carRoof(id) : 0;
  const ghost: Ghost = { mesh, x: 0, y: -40, z: 0, yaw: 0, shown: false, swing: 0, blood, roof };
  ghosts.set(key, ghost);
  return ghost;
}

function addPerson(ctx: GameContext, kind: 'player' | 'npc', id: number): number {
  const person = kind === 'player' ? null : (citizens[id % citizens.length] ?? citizens[0]);
  return ctx.renderer.addModel({
    url: person?.url ?? characterModel,
    position: { x: 0, y: -40, z: 0 },
    scale: person?.scale ?? characterScale,
    alignYaw: characterAlignYaw,
    offset: { x: 0, y: feet + (person?.lift ?? 0), z: 0 },
    clips: person?.clips ?? characterClips,
    ...(person && 'clipSource' in person ? { clipSource: person.clipSource } : {}),
  });
}

function carRoof(variant: number): number {
  const spec = trafficCatalog[variant] ?? trafficCatalog[0];
  return carRoofLift(spec?.height ?? 1.4);
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

function addBlood(ctx: GameContext): number {
  const mesh = ctx.renderer.addMesh({
    kind: 'box',
    size: { x: 1.25, y: 0.04, z: 0.72 },
    color: 0x7c1418,
    roughness: 1,
    position: { x: 0, y: -40, z: 0 },
  });
  ctx.renderer.setMeshVisible(mesh, false);
  return mesh;
}

function parkBlood(ctx: GameContext, mesh: number, x: number, z: number, yaw: number): void {
  if (mesh === 0) return;
  quatFromYaw(yaw, rotation);
  ctx.renderer.setMeshVisible(mesh, true);
  ctx.renderer.setMeshTransform(
    mesh,
    { x, y: sampleHeight(x, z) + STREET_LIFT + 0.03, z },
    rotation,
  );
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
  snap = false,
): void {
  if (!ghost.shown || snap) {
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

function syncBars(
  ctx: GameContext,
  players: readonly NetPlayer[],
  npcs: readonly NetNpc[],
  cameraYaw: number,
): void {
  ensureBars(ctx);
  let count = 0;
  for (const player of players) {
    if (count >= BAR_CAP) break;
    if (player.car !== 0) continue;
    const ghost = ghosts.get(`p${player.id}`);
    if (!ghost?.shown) continue;
    count = placeBar(count, ghost.x, ghost.y + PLAYER_BAR_LIFT, ghost.z, player.health, cameraYaw);
  }
  for (const npc of npcs) {
    if (count >= BAR_CAP) break;
    if ((hurtUntil.get(npc.id) ?? 0) <= clock) continue;
    const ghost = ghosts.get(`n${npc.id}`);
    if (!ghost?.shown) continue;
    count = placeBar(count, ghost.x, ghost.y + 1.05, ghost.z, npc.health, cameraYaw);
  }
  ctx.renderer.setInstances(barMesh, barMatrices, barColors, count);
  ctx.renderer.setInstances(fillMesh, barFill, fillColors, count);
  ctx.renderer.setMeshVisible(barMesh, count > 0);
  ctx.renderer.setMeshVisible(fillMesh, count > 0);
}

function placeBar(
  count: number,
  x: number,
  y: number,
  z: number,
  health: number,
  cameraYaw: number,
): number {
  const hp = Math.max(0, Math.min(1, health / sim.maxHealth));
  const fill = healthFillLayout(hp, cameraYaw);
  writeTransformMatrix(barMatrices, count, x, y, z, cameraYaw, 0, HEALTH_TRACK_WIDTH, 0.09, 0.045);
  writeTransformMatrix(
    barFill,
    count,
    x + fill.x,
    y,
    z + fill.z,
    cameraYaw,
    0,
    fill.width,
    0.055,
    0.05,
  );
  fillColors[count * 3] = 0.9 * (1 - hp) + 0.15;
  fillColors[count * 3 + 1] = 0.75 * hp + 0.08;
  fillColors[count * 3 + 2] = 0.12;
  barColors[count * 3] = 0.08;
  barColors[count * 3 + 1] = 0.08;
  barColors[count * 3 + 2] = 0.09;
  return count + 1;
}

function ensureBars(ctx: GameContext): void {
  if (barMesh !== 0) return;
  barColors.fill(0.08);
  barMesh = ctx.renderer.addInstances({
    kind: 'box',
    unit: true,
    size: { x: 1, y: 1, z: 1 },
    color: 0x151515,
    count: BAR_CAP,
    matrices: barMatrices,
    colors: barColors,
    roughness: 0.4,
    metalness: 0,
    castShadow: false,
  });
  fillMesh = ctx.renderer.addInstances({
    kind: 'box',
    unit: true,
    size: { x: 1, y: 1, z: 1 },
    color: 0x3dba5a,
    count: BAR_CAP,
    matrices: barFill,
    colors: fillColors,
    roughness: 0.35,
    metalness: 0,
    castShadow: false,
  });
  ctx.renderer.setMeshVisible(barMesh, false);
  ctx.renderer.setMeshVisible(fillMesh, false);
}

function approachAngle(from: number, to: number, blend: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * blend;
}
