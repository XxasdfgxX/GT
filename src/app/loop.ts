/** Presents one frame: sample input, run the fixed steps, then render with the leftover alpha. */

import type { World } from 'bitecs';
import { sim } from '../content/sim';
import type { GameContext } from '../game/context';
import { beginFrame, consumeStep, endFrame } from '../engine/core/time';

export interface FrameHooks {
  sampleInput(ctx: GameContext, world: World): void;
  updateLook(ctx: GameContext, world: World): void;
  fixedUpdate(ctx: GameContext, world: World): void;
  render(ctx: GameContext, world: World, frameDt: number): void;
}

export function runFrame(ctx: GameContext, world: World, frameDt: number, hooks: FrameHooks): void {
  const steps = beginFrame(ctx.time, frameDt, sim.maxFrameDt, sim.maxSteps);
  hooks.sampleInput(ctx, world);
  hooks.updateLook(ctx, world);
  for (let i = 0; i < steps; i += 1) {
    hooks.fixedUpdate(ctx, world);
    consumeStep(ctx.time);
  }
  endFrame(ctx.time);
  hooks.render(ctx, world, frameDt);
  ctx.input.endFrame();
}
