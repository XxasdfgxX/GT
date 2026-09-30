/** Point the city and the crowd follow. On foot this is the body. In a car it is the chassis. */

import type { World } from 'bitecs';
import { Player, Transform } from '../ecs/components';
import { players } from '../ecs/queries';
import { Mode } from '../systems/player-movement';

const fallback = { x: 0, z: 12 };

export function playerFocus(world: World): { x: number; z: number } {
  let x = fallback.x;
  let z = fallback.z;
  for (const eid of players(world)) {
    x = Transform.px[eid] ?? x;
    z = Transform.pz[eid] ?? z;
    if (Player.mode[eid] === Mode.Driving) {
      const ride = Player.vehicle[eid] ?? 0;
      if (ride > 0) {
        x = Transform.px[ride] ?? x;
        z = Transform.pz[ride] ?? z;
      }
    }
    break;
  }
  return { x, z };
}
