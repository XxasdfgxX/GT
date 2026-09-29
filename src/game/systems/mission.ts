/** Walk onto the crate, then drive it onto the pad. The timer starts at pickup. */

import type { World } from 'bitecs';
import { delivery } from '../../content/mission';
import type { GameContext } from '../../engine/core/context';
import { Mission, Player, Transform } from '../ecs/components';
import { missions, players } from '../ecs/queries';
import { MissionPhase, stepMission } from '../play/mission';
import { Mode } from './player-movement';

export function missionSystem(ctx: GameContext, world: World): void {
  for (const mid of missions(world)) {
    let driving = false;
    let x = 0;
    let z = 0;
    for (const eid of players(world)) {
      driving = Player.mode[eid] === Mode.Driving;
      const target = driving ? (Player.vehicle[eid] ?? eid) : eid;
      x = Transform.px[target] ?? 0;
      z = Transform.pz[target] ?? 0;
    }
    const pickupDistance = Math.hypot(x - delivery.pickup.x, z - delivery.pickup.z);
    const dropoffDistance = Math.hypot(x - delivery.dropoff.x, z - delivery.dropoff.z);
    const previous = Mission.phase[mid] ?? MissionPhase.Pickup;
    const next = stepMission(
      { phase: previous, time: Mission.time[mid] ?? 0 },
      driving,
      pickupDistance,
      dropoffDistance,
      delivery.radius,
      ctx.time.fixedDt,
    );
    Mission.phase[mid] = next.phase;
    Mission.time[mid] = next.time;
    if (previous === MissionPhase.Pickup && next.phase === MissionPhase.Deliver) {
      const mesh = Mission.pickupMesh[mid] ?? 0;
      if (mesh !== 0) ctx.renderer.setMeshVisible(mesh, false);
      ctx.audio.playSting('pickup');
    }
    if (previous !== MissionPhase.Done && next.phase === MissionPhase.Done) {
      ctx.audio.playSting('dropoff');
    }
  }
}
