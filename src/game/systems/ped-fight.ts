/** Walkers who fight back: chasing, swinging and landing punches. */

import { sampleHeight } from '../../content/map/island-shape';
import { quatFromYaw } from '../../engine/core/math';
import type { GameContext } from '../context';
import { Pedestrian, Player, Transform } from '../ecs/components';
import { pedestrians } from '../ecs/queries';
import { meshYaw } from '../../sim/aim-cursor';
import type { World } from 'bitecs';
import {
  applyDamage,
  COUNTER_DAMAGE,
  HURT_SECONDS,
  hurtRemaining,
  PedState,
  punchHits,
} from '../../sim/ped-ai';
import { slide } from './ped-shove';
import { rot } from './pedestrians';

export const STUCK_SECONDS = 1.5;

export const PUNCH_REACH = 1.85;

export const FIGHT_REACH = 1.7;

export function fight(
  world: World,
  eid: number,
  dt: number,
  px: number,
  pz: number,
  playerEid: number,
  playerDriving: boolean,
): void {
  const x = Transform.px[eid] ?? 0;
  const z = Transform.pz[eid] ?? 0;
  const dx = px - x;
  const dz = pz - z;
  const distance = Math.hypot(dx, dz);
  Pedestrian.cool[eid] = hurtRemaining(Pedestrian.cool[eid] ?? 0, dt);
  const playerDown = playerEid < 0 || (Player.health[playerEid] ?? 0) <= 0;
  if (playerDriving || playerDown || distance > 9) {
    Pedestrian.state[eid] = PedState.Idle;
    Pedestrian.speed[eid] = 0;
    Pedestrian.wait[eid] = 0.4;
    return;
  }
  if (distance > FIGHT_REACH) {
    slide(world, eid, px, pz, 2.6, dt);
    return;
  }
  Pedestrian.speed[eid] = 0;
  Pedestrian.yaw[eid] = meshYaw(dx, dz);
  quatFromYaw(Pedestrian.yaw[eid] ?? 0, rot);
  Transform.qx[eid] = rot.x;
  Transform.qy[eid] = rot.y;
  Transform.qz[eid] = rot.z;
  Transform.qw[eid] = rot.w;
  if ((Pedestrian.cool[eid] ?? 0) > 0) return;
  Player.health[playerEid] = applyDamage(Player.health[playerEid] ?? 10, COUNTER_DAMAGE);
  Pedestrian.cool[eid] = 1.05;
  Pedestrian.swing[eid] = 0.48;
  Pedestrian.swingId[eid] = (Pedestrian.swingId[eid] ?? 0) + 1;
}

export function connectPunch(
  ctx: GameContext,
  world: World,
  px: number,
  pz: number,
  facing: number,
  damage: number,
): void {
  let best = -1;
  let bestDistance = PUNCH_REACH;
  for (const eid of pedestrians(world)) {
    if ((Pedestrian.active[eid] ?? 0) === 0 || (Pedestrian.driving[eid] ?? 0) === 1) continue;
    const tx = Transform.px[eid] ?? 0;
    const tz = Transform.pz[eid] ?? 0;
    if (!punchHits(px, pz, facing, tx, tz, PUNCH_REACH)) continue;
    const distance = Math.hypot(tx - px, tz - pz);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = eid;
    }
  }
  if (best < 0) return;
  const tx = Transform.px[best] ?? px;
  const tz = Transform.pz[best] ?? pz;
  const away = Math.atan2(tx - px, tz - pz);
  const nx = Math.sin(away);
  const nz = Math.cos(away);
  const x = tx + nx * 0.7;
  const z = tz + nz * 0.7;
  const y = sampleHeight(x, z);
  Transform.ppx[best] = tx;
  Transform.ppz[best] = tz;
  Transform.ppy[best] = Transform.py[best] ?? y;
  Transform.px[best] = x;
  Transform.pz[best] = z;
  Transform.py[best] = y;
  const health = applyDamage(Pedestrian.health[best] ?? 10, damage);
  Pedestrian.health[best] = health;
  Pedestrian.hurt[best] = HURT_SECONDS;
  Pedestrian.speed[best] = 0;
  if (health <= 0) {
    Pedestrian.state[best] = PedState.Down;
  } else {
    Pedestrian.state[best] = PedState.Fight;
    Pedestrian.cool[best] = 0.45;
    Pedestrian.swingId[best] = (Pedestrian.swingId[best] ?? 0) + 1;
  }
  ctx.events.emit('pedestrian:hit', { pedestrian: best, speed: 0 });
}
