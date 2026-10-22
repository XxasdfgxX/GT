/** A local player's body left on the street after they respawn. */

import { STREET_LIFT } from '../../../content/map/road-mesh';
import { sampleHeight } from '../../../content/map/island-shape';
import { characterAlignYaw, characterScale, citizens } from '../../../content/models';
import { sim } from '../../../content/sim';
import type { GameContext } from '../../context';
import { quatFromYaw } from '../../../engine/core/math';
import { CORPSE_TIME } from '../../../sim/wallet';

interface Remain {
  mesh: number;
  blood: number;
  left: number;
  shown: boolean;
}

const pool: Remain[] = [];
const rotation = { x: 0, y: 0, z: 0, w: 1 };
const feet = -(sim.playerRadius + sim.playerHalfHeight) + STREET_LIFT;
let dieToken = 1;

export function resetRemains(): void {
  pool.length = 0;
  dieToken = 1;
}

export function layLocalCorpse(
  ctx: GameContext,
  x: number,
  y: number,
  z: number,
  yaw: number,
): void {
  const slot = pool.find((item) => !item.shown) ?? createRemain(ctx);
  slot.shown = true;
  slot.left = CORPSE_TIME;
  dieToken += 1;
  quatFromYaw(yaw, rotation);
  ctx.renderer.setMeshVisible(slot.mesh, true);
  ctx.renderer.setMeshTransform(slot.mesh, { x, y, z }, rotation);
  ctx.renderer.playClip(slot.mesh, 'die', dieToken);
  parkBlood(ctx, slot.blood, x, z, yaw);
}

export function tickRemains(ctx: GameContext, dt: number): void {
  for (const slot of pool) {
    if (!slot.shown) continue;
    slot.left -= dt;
    if (slot.left > 0) continue;
    slot.shown = false;
    ctx.renderer.setMeshVisible(slot.mesh, false);
    ctx.renderer.setMeshVisible(slot.blood, false);
  }
}

function createRemain(ctx: GameContext): Remain {
  const person = citizens[0];
  const mesh = ctx.renderer.addModel({
    url: person.url,
    position: { x: 0, y: -40, z: 0 },
    scale: characterScale,
    alignYaw: characterAlignYaw,
    offset: { x: 0, y: feet, z: 0 },
    clips: person.clips,
  });
  const blood = ctx.renderer.addMesh({
    kind: 'box',
    size: { x: 1.25, y: 0.04, z: 0.72 },
    color: 0x7c1418,
    roughness: 1,
    position: { x: 0, y: -40, z: 0 },
  });
  ctx.renderer.setMeshVisible(mesh, false);
  ctx.renderer.setMeshVisible(blood, false);
  const slot: Remain = { mesh, blood, left: 0, shown: false };
  pool.push(slot);
  return slot;
}

function parkBlood(ctx: GameContext, mesh: number, x: number, z: number, yaw: number): void {
  quatFromYaw(yaw, rotation);
  ctx.renderer.setMeshVisible(mesh, true);
  ctx.renderer.setMeshTransform(
    mesh,
    { x, y: sampleHeight(x, z) + STREET_LIFT + 0.03, z },
    rotation,
  );
}
