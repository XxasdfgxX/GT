/** Wires the browser, starts the loop, and spawns the blockout. */

import { createWebAudioBus } from '../engine/audio/audio-bus';
import { AssetManager } from '../engine/assets/asset-manager';
import { createBrowserInput } from '../engine/input/browser-input';
import { createRapierWorld } from '../engine/physics/rapier-world';
import { createThreeRenderer } from '../engine/render/three-renderer';
import { buildCostaVerde } from '../content/city';
import { carModel, characterModel, citizens } from '../content/models';
import { sim } from '../content/sim';
import { spawnMission } from '../game/features/mission/spawn-mission';
import { spawnPlayer } from '../game/features/player/spawn-player';
import { spawnPedCrowd } from '../game/features/pedestrians/crowd';
import { spawnTrafficPool } from '../game/features/traffic/pool';
import { spawnVehicle } from '../game/features/vehicles/spawn-vehicle';
import { spawnMap, streamAround } from '../game/features/world/spawn-map';
import { readHud } from '../game/play/read-hud';
import { createGameWorld } from '../game/ecs/world';
import { bakeRadarMap } from '../ui/radar-map';
import { indexStreets } from '../ui/street-route';
import { mountStartMenu, type LaunchChoice, type StartMenu } from '../ui/start-menu';
import { createWaypoint } from '../ui/waypoint';
import { lookSensitivity, type GameSettings } from '../ui/settings';
import { fixedStep, renderScene, sampleInput, updateLook } from '../game/simulate';
import { isMenuChord } from '../ui/menu-key';
import { mountHud } from '../ui/mount-hud';
import { createPathNav } from '../engine/nav/three-pathfinding-nav';
import { createContext } from './create-context';
import { runFrame } from './loop';

let session: { stop: () => void } | null = null;

export async function start(root: HTMLElement, launch: LaunchChoice): Promise<void> {
  session?.stop();
  let running = true;
  const cleanups: Array<() => void> = [];
  const stop = () => {
    if (!running) return;
    running = false;
    for (const cleanup of cleanups.reverse()) cleanup();
    if (session === handle) session = null;
  };
  const handle = { stop };
  session = handle;

  try {
    const canvas = document.createElement('canvas');
    root.append(canvas);
    cleanups.push(() => {
      canvas.remove();
    });

    const assets = new AssetManager();
    cleanups.push(() => {
      assets.dispose();
    });
    const renderer = createThreeRenderer(canvas, assets);
    cleanups.push(() => {
      renderer.dispose();
    });
    renderer.setGraphics({
      shadows: launch.settings.shadows,
      sharpness: launch.settings.sharpness,
    });
    const physics = await createRapierWorld(sim.worldGravity);
    cleanups.push(() => {
      physics.dispose();
    });
    const input = createBrowserInput(canvas);
    cleanups.push(() => {
      input.releasePointer();
      input.dispose();
    });
    const audio = createWebAudioBus(canvas);
    cleanups.push(() => {
      audio.dispose();
    });
    audio.setVolume(launch.settings.volume);
    const city = buildCostaVerde();
    const nav = createPathNav();
    nav.load(city.walks);
    const ctx = createContext({
      input,
      physics,
      renderer,
      nav,
      audio,
      assets,
      mouseSensitivity: lookSensitivity(launch.settings),
    });
    const urls = [characterModel, carModel, ...citizens.map((person) => person.url)];
    await Promise.all([renderer.prepare(), ...[...urls].map((url) => renderer.preloadModel(url))]);
    const world = createGameWorld();
    spawnMap(ctx, city);
    for (let guard = 0; guard < 80 && streamAround(ctx, 0, 12, 4) > 0; guard += 1) {
      /* fill the blocks around the spawn before the first frame */
    }
    spawnVehicle(ctx, world);
    spawnTrafficPool(ctx, world);
    spawnPedCrowd(ctx, world);
    spawnPlayer(ctx, world);
    if (launch.mode === 'mission') spawnMission(ctx, world);

    const radarMap = bakeRadarMap(city);
    const streets = indexStreets(city.graph);
    const waypoint = createWaypoint();

    const resize = () => {
      renderer.setSize(root.clientWidth, root.clientHeight);
    };
    resize();
    window.addEventListener('resize', resize);
    cleanups.push(() => {
      window.removeEventListener('resize', resize);
    });

    let paused = false;
    let overlay: StartMenu | null = null;
    let last = performance.now();

    const applySettings = (settings: GameSettings) => {
      audio.setVolume(settings.volume);
      renderer.setGraphics({ shadows: settings.shadows, sharpness: settings.sharpness });
      ctx.look.mouseSensitivity = lookSensitivity(settings);
      resize();
    };
    const unpause = () => {
      paused = false;
      overlay = null;
      last = performance.now();
    };
    const openMenu = () => {
      if (!running || paused) return;
      paused = true;
      input.releasePointer();
      audio.setEngine(0, 0);
      const place = readHud(world);
      overlay = mountStartMenu(root, (choice) => start(root, choice), {
        resume: unpause,
        onSettings: applySettings,
        map: {
          image: radarMap,
          streets,
          playerX: place.x,
          playerZ: place.z,
          waypoint,
        },
      });
    };
    const onMenuKey = (event: KeyboardEvent) => {
      if (event.repeat || !running || !isMenuChord(event.key, event.code)) return;
      event.preventDefault();
      if (!overlay) {
        openMenu();
        return;
      }
      if (overlay.close()) unpause();
    };
    window.addEventListener('keydown', onMenuKey);
    cleanups.push(() => {
      window.removeEventListener('keydown', onMenuKey);
    });

    const hud = mountHud(root, radarMap, streets, waypoint, openMenu, ctx.debug);
    cleanups.push(() => {
      hud.remove();
    });
    ctx.log.info('pronto');

    const frame = (now: number) => {
      if (!running) return;
      if (paused) {
        last = now;
        requestAnimationFrame(frame);
        return;
      }
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
          if (context.input.snapshot().debugOverlay) {
            context.debug.showGraph = !context.debug.showGraph;
          }
        },
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  } catch (error) {
    stop();
    throw error;
  }
}
