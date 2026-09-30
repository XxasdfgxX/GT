/** Flips a chassis back onto its wheels after it has rested on the roof for a second. */

import type { World } from 'bitecs';
import { sampleHeight } from '../../content/map/island-shape';
import { trafficCatalog } from '../../content/traffic-catalog';
import { sedan } from '../../content/vehicles';
import type { GameContext } from '../../engine/core/context';
import { quatFromYaw } from '../../engine/core/math';
import { CAP, PhysicsRef, Traffic } from '../ecs/components';
import { traffic, vehicles } from '../ecs/queries';
import { chassisUp, headingYaw, readyToFlip, roofTime } from '../play/upright';
import { MODE_WRECK } from './traffic';

const spent = new Float32Array(CAP);
const pos = { x: 0, y: 0, z: 0 };
const rot = { x: 0, y: 0, z: 0, w: 1 };
const upright = { x: 0, y: 0, z: 0, w: 1 };

export function recoverVehicles(ctx: GameContext, world: World): void {
  const dt = ctx.time.fixedDt;
  for (const eid of vehicles(world)) recover(ctx, eid, dt, sedan.spawn.y);
  for (const eid of traffic(world)) {
    if ((Traffic.mode[eid] ?? 0) !== MODE_WRECK) {
      spent[eid] = 0;
      continue;
    }
    const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
    recover(ctx, eid, dt, (spec?.height ?? 1.4) / 2 + 0.2);
  }
}

function recover(ctx: GameContext, eid: number, dt: number, lift: number): void {
  const body = PhysicsRef.body[eid] ?? 0;
  if (body === 0) return;
  ctx.physics.getTransform(body, pos, rot);
  const waited = roofTime(spent[eid] ?? 0, chassisUp(rot.x, rot.y, rot.z, rot.w), dt);
  spent[eid] = waited;
  if (!readyToFlip(waited)) return;
  spent[eid] = 0;
  quatFromYaw(headingYaw(rot.x, rot.y, rot.z, rot.w), upright);
  pos.y = sampleHeight(pos.x, pos.z) + lift;
  ctx.physics.setTransform(body, pos, upright);
}
