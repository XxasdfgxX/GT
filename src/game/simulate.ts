/** Fixed-step and render order for the playable slice. */

import type { World } from 'bitecs';
import { sim } from '../content/sim';
import type { GameContext } from './context';
import { CameraRig, Mode, Player, RenderRef } from './ecs/components';
import { players } from './ecs/queries';
import { animatePlayer } from './systems/animate-player';
import { updateCameraLook, placeCamera } from './systems/camera-follow';
import { boardCarSystem } from './systems/board-car';
import { interactionSystem } from './systems/interaction';
import { netRideSystem } from './systems/net-ride';
import { missionSystem } from './systems/mission';
import {
  applyPlayerFacing,
  playerMovementSystem,
  separateFromPeers,
} from './systems/player-movement';
import { facePlayerToCursor } from './systems/aim-facing';
import { sampleInputSystem } from './systems/sample-input';
import { pushInterpolatedTransforms, syncTransforms, syncWheels } from './systems/sync-transforms';
import { vehicleDriveSystem } from './systems/vehicle-drive';
import { streamCitySystem } from './systems/stream-city';
import { syncDebugView } from './features/world/debug-graph';
import { pedestrianSystem, pedestrianVisual } from './systems/pedestrians';
import { recoverVehicles, releaseFromBuildings } from './systems/recover-vehicle';
import { trafficSystem } from './systems/traffic';
import { applyNetState, publishNet } from './systems/net';
import { cashSystem } from './systems/cash';
import { syncRemotes } from './features/net/remotes';
import { advanceClock, dayFraction } from '../sim/clock';

export function sampleInput(ctx: GameContext, world: World): void {
  sampleInputSystem(ctx, world);
}

export function updateLook(ctx: GameContext, world: World): void {
  updateCameraLook(ctx, world);
}

export function fixedStep(ctx: GameContext, world: World): void {
  // A room's clock comes with its state; solo play runs its own, and pause stops it.
  if (!ctx.net) advanceClock(ctx.clock, ctx.time.fixedDt);
  applyNetState(ctx, world);
  streamCitySystem(ctx, world);
  if (ctx.net) netRideSystem(ctx, world);
  else interactionSystem(ctx, world);
  playerMovementSystem(ctx, world);
  vehicleDriveSystem(ctx, world);
  if (ctx.net) {
    publishNet(ctx, world);
  } else {
    trafficSystem(ctx, world);
    pedestrianSystem(ctx, world);
    cashSystem(ctx, world);
  }
  ctx.physics.step(ctx.time.fixedDt);
  recoverVehicles(ctx, world);
  if (!ctx.net) boardCarSystem(ctx, world);
  separateFromPeers(ctx, world);
  releaseFromBuildings(ctx, world);
  syncTransforms(ctx, world);
  syncWheels(ctx, world);
  applyPlayerFacing(world);
  missionSystem(ctx, world);
}

export function renderScene(ctx: GameContext, world: World, frameDt: number): void {
  ctx.renderer.setTimeOfDay(dayFraction(ctx.clock));
  const state = ctx.net?.state();
  if (state) {
    let cameraYaw = 0;
    for (const eid of players(world)) {
      cameraYaw = CameraRig.yaw[eid] ?? 0;
      break;
    }
    syncRemotes(
      ctx,
      state.players,
      state.npcs,
      state.cars,
      state.pickups,
      state.corpses,
      cameraYaw,
      frameDt,
    );
  }
  pedestrianVisual(ctx, world);
  syncDebugView(ctx);
  placeCamera(ctx, world, frameDt);
  const aim = ctx.input.snapshot();
  facePlayerToCursor(
    world,
    ctx.input.pointerLocked,
    aim.aimX,
    aim.aimY,
    aim.viewWidth,
    aim.viewHeight,
    ctx.time.alpha,
    sim.cameraFov,
  );
  pushInterpolatedTransforms(ctx, world);
  animatePlayer(ctx, world);
  aimHeadlights(ctx, world);
  ctx.renderer.tick(frameDt);
  ctx.renderer.render();
}

/** The right headlamp in a car's own frame, +z ahead; the renderer mirrors the left. */
const HEADLAMP = { x: 0.62, y: 0.05, z: 2 };

/** Beams on the car the player drives. The renderer keeps them dark by day. */
function aimHeadlights(ctx: GameContext, world: World): void {
  for (const eid of players(world)) {
    const driving = Player.mode[eid] === Mode.Driving;
    const mesh = driving ? (RenderRef.mesh[Player.vehicle[eid] ?? 0] ?? 0) : 0;
    ctx.renderer.setHeadlights(mesh, mesh !== 0 ? HEADLAMP : null);
    return;
  }
}
