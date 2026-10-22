/** Crate at the start of the street and a pad at the far end. */

import { addComponent, addEntity, type World } from 'bitecs';
import { delivery } from '../../../content/mission';
import type { GameContext } from '../../context';
import { Mission } from '../../ecs/components';
import { MissionPhase } from '../../play/mission';

export function spawnMission(ctx: GameContext, world: World): number {
  const eid = addEntity(world);
  addComponent(world, eid, Mission);
  Mission.phase[eid] = MissionPhase.Pickup;
  Mission.time[eid] = 0;
  const { pickup, dropoff } = delivery;
  Mission.pickupMesh[eid] = ctx.renderer.addMesh({
    kind: 'box',
    size: { x: 0.7, y: 0.7, z: 0.7 },
    color: 0xd4a017,
    position: pickup,
    roughness: 0.7,
    metalness: 0.05,
  });
  Mission.dropoffMesh[eid] = ctx.renderer.addMesh({
    kind: 'box',
    size: { x: 3.4, y: 0.06, z: 3.4 },
    color: 0xe2c14a,
    position: dropoff,
    roughness: 0.85,
    metalness: 0,
  });
  return eid;
}
