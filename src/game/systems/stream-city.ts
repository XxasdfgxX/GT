/** Spreads chunk creation across frames and hides districts the player left. */

import type { World } from 'bitecs';
import type { GameContext } from '../../engine/core/context';
import { Transform } from '../ecs/components';
import { streamAround } from '../features/world/spawn-map';
import { players } from '../ecs/queries';

const fallback = { x: 0, z: 12 };

export function streamCitySystem(ctx: GameContext, world: World): void {
  let x = fallback.x;
  let z = fallback.z;
  for (const eid of players(world)) {
    x = Transform.px[eid] ?? x;
    z = Transform.pz[eid] ?? z;
    break;
  }
  streamAround(ctx, x, z, 2);
}
