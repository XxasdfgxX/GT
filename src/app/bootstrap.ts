/** Wires the browser, starts the loop, and spawns the blockout. */

import { createWebAudioBus } from '../engine/audio/audio-bus';
import { AssetManager } from '../engine/assets/asset-manager';
import { createBrowserInput } from '../engine/input/browser-input';
import { createRapierWorld } from '../engine/physics/rapier-world';
import { createThreeRenderer } from '../engine/render/three-renderer';
import { buildCostaVerde } from '../content/city';
import { testMap } from '../content/map';
import { carModel, characterModel } from '../content/models';
import { sim } from '../content/sim';
import { spawnMission } from '../game/features/mission/spawn-mission';
import { spawnPlayer } from '../game/features/player/spawn-player';
import { spawnVehicle } from '../game/features/vehicles/spawn-vehicle';
import { spawnMap } from '../game/features/world/spawn-map';
import { readHud } from '../game/play/read-hud';
import { createGameWorld } from '../game/ecs/world';
import { fixedStep, renderScene, sampleInput, updateLook } from '../game/simulate';
import { mountHud } from '../ui/mount-hud';
import { createContext } from './create-context';
import { runFrame } from './loop';

export async function start(root: HTMLElement): Promise<void> {
  const canvas = document.createElement('canvas');
  root.append(canvas);

  const assets = new AssetManager();
  const renderer = createThreeRenderer(canvas, assets);
  const physics = await createRapierWorld(sim.worldGravity);
  const input = createBrowserInput(canvas);
  const ctx = createContext({
    input,
    physics,
    renderer,
    audio: createWebAudioBus(canvas),
    assets,
  });
  const city = buildCostaVerde();
  const urls = new Set<string>([
    characterModel,
    carModel,
    ...testMap.buildings.map((building) => building.model),
    ...city.houses.map((house) => house.model),
  ]);
  await Promise.all([...urls].map((url) => renderer.preloadModel(url)));
  const world = createGameWorld();
  spawnMap(ctx, city);
  spawnVehicle(ctx, world);
  spawnPlayer(ctx, world);
  spawnMission(ctx, world);
  const hud = mountHud(root, city);

  const resize = () => {
    renderer.setSize(root.clientWidth, root.clientHeight);
  };
  resize();
  window.addEventListener('resize', resize);
  ctx.log.info('pronto');

  let last = performance.now();
  const frame = (now: number) => {
    const frameDt = Math.max(0, (now - last) / 1000);
    last = now;
    runFrame(ctx, world, frameDt, {
      sampleInput,
      updateLook,
      fixedUpdate: fixedStep,
      render(context, ecs, dt) {
        renderScene(context, ecs, dt);
        hud.updateFps(dt);
        hud.setStats(context.renderer.drawCalls(), context.physics.bodyCount());
        hud.setLocked(context.input.pointerLocked);
        hud.setPlay(readHud(world));
        if (context.input.snapshot().debugToggle) hud.toggle();
      },
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
