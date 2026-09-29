/** Copies the input snapshot into the player. Jump and interact latch until a system clears them. */

import type { World } from 'bitecs';
import type { GameContext } from '../../engine/core/context';
import { InputState } from '../ecs/components';
import { players } from '../ecs/queries';

export function sampleInputSystem(ctx: GameContext, world: World): void {
  const snap = ctx.input.snapshot();
  for (const eid of players(world)) {
    InputState.moveX[eid] = snap.moveX;
    InputState.moveZ[eid] = snap.moveZ;
    InputState.throttle[eid] = snap.throttle;
    InputState.brake[eid] = snap.brake;
    InputState.steer[eid] = snap.steer;
    InputState.sprint[eid] = snap.sprint ? 1 : 0;
    InputState.handbrake[eid] = snap.handbrake ? 1 : 0;
    InputState.lookX[eid] = snap.lookX;
    InputState.lookY[eid] = snap.lookY;
    InputState.zoom[eid] = snap.zoom;
    if (snap.jump) InputState.jump[eid] = 1;
    if (snap.punch) InputState.punch[eid] = 1;
    if (snap.interact) InputState.interact[eid] = 1;
  }
}
