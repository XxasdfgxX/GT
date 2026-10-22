/** Spreads chunk creation across frames and hides districts the player left. */

import type { World } from 'bitecs';
import type { GameContext } from '../context';
import { playerFocus } from '../play/player-focus';
import { streamAround } from '../features/world/spawn-map';

export function streamCitySystem(ctx: GameContext, world: World): void {
  const focus = playerFocus(world);
  streamAround(ctx, focus.x, focus.z, 2);
}
