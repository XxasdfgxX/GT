/** Fixed-step and render order for the playable slice. */

import type { World } from 'bitecs';
import type { GameContext } from '../engine/core/context';
import { animatePlayer } from './systems/animate-player';
import { updateCameraLook, placeCamera } from './systems/camera-follow';
import { interactionSystem } from './systems/interaction';
import { missionSystem } from './systems/mission';
import { applyPlayerFacing, playerMovementSystem } from './systems/player-movement';
import { sampleInputSystem } from './systems/sample-input';
import { pushInterpolatedTransforms, syncTransforms, syncWheels } from './systems/sync-transforms';
import { vehicleDriveSystem } from './systems/vehicle-drive';

export function sampleInput(ctx: GameContext, world: World): void {
  sampleInputSystem(ctx, world);
}

export function updateLook(ctx: GameContext, world: World): void {
  updateCameraLook(ctx, world);
}

export function fixedStep(ctx: GameContext, world: World): void {
  interactionSystem(ctx, world);
  playerMovementSystem(ctx, world);
  vehicleDriveSystem(ctx, world);
  ctx.physics.step(ctx.time.fixedDt);
  syncTransforms(ctx, world);
  syncWheels(ctx, world);
  applyPlayerFacing(world);
  missionSystem(ctx, world);
}

export function renderScene(ctx: GameContext, world: World, frameDt: number): void {
  pushInterpolatedTransforms(ctx, world);
  placeCamera(ctx, world, frameDt);
  animatePlayer(ctx, world);
  ctx.renderer.tick(frameDt);
  ctx.renderer.render();
}
