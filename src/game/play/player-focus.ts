/** Point the city and the crowd follow. On foot this is the body. In a car it is the chassis. */

import type { World } from 'bitecs';
import { Player, Transform, Mode } from '../ecs/components';
import { players } from '../ecs/queries';

const fallback = { x: 0, z: 12 };
const focus = { x: 0, z: 0 };

/** The only answer to "where is the player". Shared scratch: read it before the next call. */
export function playerFocus(world: World): Readonly<{ x: number; z: number }> {
  focus.x = fallback.x;
  focus.z = fallback.z;
  for (const eid of players(world)) {
    focus.x = Transform.px[eid] ?? focus.x;
    focus.z = Transform.pz[eid] ?? focus.z;
    if (Player.mode[eid] === Mode.Driving) {
      const ride = Player.vehicle[eid] ?? 0;
      if (ride > 0) {
        focus.x = Transform.px[ride] ?? focus.x;
        focus.z = Transform.pz[ride] ?? focus.z;
      }
    }
    break;
  }
  return focus;
}
