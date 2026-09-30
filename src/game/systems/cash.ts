/** Solo cash: a dead neighbor leaves $10, and the player drops what they carried. */

import { addComponent, addEntity, type World } from 'bitecs';
import { sim } from '../../content/sim';
import type { GameContext } from '../../engine/core/context';
import { Pedestrian, Pickup, Player, RenderRef, Transform, writePose } from '../ecs/components';
import { pedestrians, pickups, players } from '../ecs/queries';
import { hideBody, showBody } from '../features/player/place-player';
import {
  NPC_DROP,
  PICKUP_REACH,
  RESPAWN_DELAY,
  CORPSE_TIME,
  addCash,
  dropCash,
} from '../play/wallet';
import { layLocalCorpse, tickRemains } from '../features/corpse/remain';

const identity = { x: 0, y: 0, z: 0, w: 1 };

export function cashSystem(ctx: GameContext, world: World): void {
  for (const eid of pedestrians(world)) {
    if ((Pedestrian.active[eid] ?? 0) === 0 || (Pedestrian.health[eid] ?? 0) > 0) continue;
    let left = Pedestrian.corpse[eid] ?? 0;
    if (left <= 0) {
      spawnPickup(
        ctx,
        world,
        Transform.px[eid] ?? 0,
        Transform.py[eid] ?? 0,
        Transform.pz[eid] ?? 0,
        NPC_DROP,
      );
      left = CORPSE_TIME;
    }
    left -= ctx.time.fixedDt;
    if (left > 0) {
      Pedestrian.corpse[eid] = left;
      continue;
    }
    Pedestrian.active[eid] = 0;
    Pedestrian.health[eid] = sim.maxHealth;
    Pedestrian.corpse[eid] = 0;
    writePose(eid, 0, -30, 0);
  }

  for (const eid of players(world)) {
    if ((Player.health[eid] ?? 0) > 0) continue;
    if ((Player.life[eid] ?? 0) <= 0 && (Player.hidden[eid] ?? 0) === 0) {
      const dropped = dropCash(Player.cash[eid] ?? 0);
      Player.cash[eid] = dropped.balance;
      if (dropped.dropped > 0) {
        spawnPickup(
          ctx,
          world,
          Transform.px[eid] ?? 0,
          Transform.py[eid] ?? 0,
          Transform.pz[eid] ?? 0,
          dropped.dropped,
        );
      }
      layLocalCorpse(
        ctx,
        Transform.px[eid] ?? 0,
        Transform.py[eid] ?? 0,
        Transform.pz[eid] ?? 0,
        Player.facing[eid] ?? 0,
      );
      hideBody(ctx, eid);
      Player.life[eid] = RESPAWN_DELAY;
    }
    const left = (Player.life[eid] ?? 0) - ctx.time.fixedDt;
    if (left > 0) {
      Player.life[eid] = left;
      continue;
    }
    showBody(ctx, eid, Player.homeX[eid] ?? 0, Player.homeY[eid] ?? 0, Player.homeZ[eid] ?? 0);
    Player.health[eid] = sim.maxHealth;
    Player.cash[eid] = 0;
    Player.life[eid] = 0;
  }

  tickRemains(ctx, ctx.time.fixedDt);
  collect(ctx, world);
}

function collect(ctx: GameContext, world: World): void {
  let px = 0;
  let pz = 0;
  let player = -1;
  for (const eid of players(world)) {
    if ((Player.health[eid] ?? 0) <= 0) return;
    px = Transform.px[eid] ?? 0;
    pz = Transform.pz[eid] ?? 0;
    player = eid;
    break;
  }
  if (player < 0) return;
  for (const eid of pickups(world)) {
    const amount = Pickup.amount[eid] ?? 0;
    if (amount <= 0) continue;
    const dx = (Transform.px[eid] ?? 0) - px;
    const dz = (Transform.pz[eid] ?? 0) - pz;
    if (Math.hypot(dx, dz) > PICKUP_REACH) continue;
    Player.cash[player] = addCash(Player.cash[player] ?? 0, amount);
    Pickup.amount[eid] = 0;
    writePose(eid, 0, -40, 0);
    const mesh = RenderRef.mesh[eid] ?? 0;
    if (mesh !== 0) ctx.renderer.setMeshVisible(mesh, false);
  }
}

function spawnPickup(
  ctx: GameContext,
  world: World,
  x: number,
  y: number,
  z: number,
  amount: number,
): void {
  let eid = -1;
  for (const existing of pickups(world)) {
    if ((Pickup.amount[existing] ?? 0) > 0) continue;
    eid = existing;
    break;
  }
  if (eid < 0) {
    eid = addEntity(world);
    addComponent(world, eid, Pickup);
    addComponent(world, eid, Transform);
    addComponent(world, eid, RenderRef);
    RenderRef.mesh[eid] = ctx.renderer.addMesh({
      kind: 'box',
      size: { x: 0.38, y: 0.1, z: 0.24 },
      color: 0xf2c14e,
      emissive: 0x8a6a12,
      position: { x, y: y + 0.45, z },
    });
  }
  Pickup.amount[eid] = amount;
  writePose(eid, x, y + 0.45, z);
  const mesh = RenderRef.mesh[eid] ?? 0;
  if (mesh === 0) return;
  ctx.renderer.setMeshVisible(mesh, true);
  ctx.renderer.setMeshTransform(mesh, { x, y: y + 0.45, z }, identity);
}
