/** Picks the body clip from speed, sprint, air, and the punch timer. */

import type { World } from 'bitecs';
import type { GameContext } from '../../engine/core/context';
import { InputState, PhysicsRef, Player, RenderRef, Velocity } from '../ecs/components';
import { players } from '../ecs/queries';
import { chooseClip } from '../play/animate';
import { boardingClip } from './board-car';
import { Mode } from './player-movement';

export function animatePlayer(ctx: GameContext, world: World): void {
  for (const eid of players(world)) {
    if (Player.mode[eid] === Mode.Driving) continue;
    const mesh = RenderRef.mesh[eid] ?? 0;
    if (mesh === 0) continue;
    if (Player.mode[eid] === Mode.Boarding) {
      const clip = boardingClip();
      if (clip) ctx.renderer.playClip(mesh, clip, 0);
      continue;
    }
    if ((Player.trip[eid] ?? 0) > 0) {
      ctx.renderer.playClip(mesh, 'die', 1);
      continue;
    }
    const speed = Math.hypot(Velocity.x[eid] ?? 0, Velocity.z[eid] ?? 0);
    const body = PhysicsRef.body[eid] ?? 0;
    const airborne = body !== 0 && !ctx.physics.isGrounded(body) && (Velocity.y[eid] ?? 0) > 0.4;
    const clip = chooseClip(
      speed,
      InputState.sprint[eid] === 1,
      airborne,
      (Player.action[eid] ?? 0) > 0,
    );
    ctx.renderer.playClip(mesh, clip, Player.punchSerial[eid] ?? 0);
  }
}
