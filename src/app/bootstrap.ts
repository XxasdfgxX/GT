/** Wires the browser, starts the loop, and spawns the blockout. */

import { createWebAudioBus } from '../engine/audio/audio-bus';
import { AssetManager } from '../engine/assets/asset-manager';
import { createBrowserInput } from '../engine/input/browser-input';
import { createRapierWorld } from '../engine/physics/rapier-world';
import { createThreeRenderer } from '../engine/render/three-renderer';
import { buildCostaVerde } from '../content/city';
import { carBody, starterCar } from '../content/cars';
import { carModel, characterModel, citizens, universalAnims } from '../content/models';
import { sim } from '../content/sim';
import { bairroSpawns, findSpawn, parkOnStreet, scatterSpawn, soloSpawn } from '../content/spawns';
import { spawnMission } from '../game/features/mission/spawn-mission';
import { resetRemains } from '../game/features/corpse/remain';
import { resetRemotes, remotePlayerMark } from '../game/features/net/remotes';
import { resetNetRide } from '../game/systems/net-ride';
import { resetNet } from '../game/systems/net';
import { clearBoard } from '../game/play/board-state';
import { spawnPlayer } from '../game/features/player/spawn-player';
import { resetCrowd, spawnPedCrowd } from '../game/features/pedestrians/crowd';
import {
  resetTrafficPool,
  spawnTrafficPool,
  syncTrafficShells,
} from '../game/features/traffic/pool';
import { spawnVehicle } from '../game/features/vehicles/spawn-vehicle';
import { resetDebugView } from '../game/features/world/debug-graph';
import { spawnMap, streamAround, syncBuildingShells } from '../game/features/world/spawn-map';
import { readCarTitle } from '../game/systems/board-car';
import { readHud } from '../game/play/read-hud';
import { createGameWorld } from '../game/ecs/world';
import { bakeRadarMap } from '../ui/radar-map';
import { indexStreets } from '../ui/street-route';
import { mountStartMenu, type LaunchChoice, type StartMenu } from '../ui/start-menu';
import { connectRoom } from '../net/session';
import { createWaypoint } from '../ui/waypoint';
import { lookSensitivity, type GameSettings } from '../ui/settings';
import { fixedStep, renderScene, sampleInput, updateLook } from '../game/simulate';
import { isMenuChord } from '../ui/menu-key';
import { mountHud } from '../ui/mount-hud';
import { createQuadNav } from '../engine/nav/quad-graph-nav';
import { createContext } from './create-context';
import { runFrame } from './loop';

let session: { stop: () => void } | null = null;

export async function start(root: HTMLElement, launch: LaunchChoice): Promise<void> {
  session?.stop();
  resetRemotes();
  resetRemains();
  resetNetRide();
  resetNet();
  resetCrowd();
  resetTrafficPool();
  resetDebugView();
  clearBoard();
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
  /** Registers a cleanup, or runs it now when stop() already happened during a load. */
  const own = (cleanup: () => void) => {
    if (running) cleanups.push(cleanup);
    else cleanup();
  };

  try {
    let connected: Awaited<ReturnType<typeof connectRoom>> | null = null;
    if (launch.mode === 'multiplayer') {
      if (!launch.roomId) throw new Error('Sala ausente');
      connected = await connectRoom(launch.roomId, launch.playerName, launch.spawn ?? '');
      own(() => {
        connected?.link.close();
      });
      if (!running) return;
    }
    const city = buildCostaVerde();
    const center = findSpawn(bairroSpawns(city.graph), launch.spawn ?? '') ?? soloSpawn();
    const at = connected
      ? {
          name: 'sala',
          x: connected.welcome.x,
          y: connected.welcome.y,
          z: connected.welcome.z,
        }
      : scatterSpawn(center, Math.random);

    const canvas = document.createElement('canvas');
    root.append(canvas);
    own(() => {
      canvas.remove();
    });

    const assets = new AssetManager();
    own(() => {
      assets.dispose();
    });
    const renderer = createThreeRenderer(canvas, assets, sim.cameraFov);
    own(() => {
      renderer.dispose();
    });
    renderer.setGraphics({
      shadows: launch.settings.shadows,
      sharpness: launch.settings.sharpness,
    });
    const physics = await createRapierWorld(sim.worldGravity);
    own(() => {
      physics.dispose();
    });
    if (!running) return;
    const input = createBrowserInput(canvas);
    own(() => {
      input.releasePointer();
      input.dispose();
    });
    const audio = createWebAudioBus(canvas);
    own(() => {
      audio.dispose();
    });
    audio.setVolume(launch.settings.volume);
    const nav = createQuadNav();
    nav.load(city.walks);
    const ctx = createContext({
      input,
      physics,
      renderer,
      nav,
      audio,
      assets,
      mouseSensitivity: lookSensitivity(launch.settings),
      net: connected?.link ?? null,
    });
    ctx.debug.showColliders = launch.settings.admin && launch.settings.colliders;
    const parked = starterCar(launch.settings);
    const urls = [
      characterModel,
      carModel,
      universalAnims,
      ...citizens.map((person) => person.url),
    ];
    if (!connected) {
      const parkedModel = carBody(parked.id).url;
      if (parkedModel !== carModel) urls.push(parkedModel);
    }
    await Promise.all([renderer.prepare(), ...[...urls].map((url) => renderer.preloadModel(url))]);
    if (!running) return;
    const world = createGameWorld();
    spawnMap(ctx, city);
    for (let guard = 0; guard < 80 && streamAround(ctx, at.x, at.z, 4) > 0; guard += 1) {
      /* fill the blocks around the spawn before the first frame */
    }
    if (!connected) {
      const spot = parkOnStreet(city, at, carBody(parked.id).halfExtents);
      spawnVehicle(ctx, world, spot, parked.id);
      spawnTrafficPool(ctx, world);
      spawnPedCrowd(ctx, world);
    }
    spawnPlayer(ctx, world, at, connected?.welcome.placeSerial ?? 0);
    if (launch.mode === 'mission') spawnMission(ctx, world);

    const radarMap = bakeRadarMap(city);
    const streets = indexStreets(city.graph);
    const waypoint = createWaypoint();

    const resize = () => {
      renderer.setSize(root.clientWidth, root.clientHeight);
    };
    resize();
    window.addEventListener('resize', resize);
    own(() => {
      window.removeEventListener('resize', resize);
    });
    // Dragging the window to a screen with another pixel ratio fires no resize.
    let ratioQuery: MediaQueryList | null = null;
    const onRatio = () => {
      resize();
      watchRatio();
    };
    const watchRatio = () => {
      ratioQuery?.removeEventListener('change', onRatio);
      ratioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      ratioQuery.addEventListener('change', onRatio);
    };
    watchRatio();
    own(() => {
      ratioQuery?.removeEventListener('change', onRatio);
    });

    let paused = false;
    let overlay: StartMenu | null = null;
    let last = performance.now();
    let failures = 0;

    const applySettings = (settings: GameSettings) => {
      audio.setVolume(settings.volume);
      renderer.setGraphics({ shadows: settings.shadows, sharpness: settings.sharpness });
      ctx.look.mouseSensitivity = lookSensitivity(settings);
      ctx.debug.showColliders = settings.admin && settings.colliders;
      syncBuildingShells(ctx);
      syncTrafficShells(ctx);
      resize();
    };
    const unpause = () => {
      paused = false;
      overlay = null;
      last = performance.now();
      // Keys typed or held in the menu must not fire on the first frame back.
      input.reset();
    };
    const openMenu = () => {
      if (!running || paused) return;
      paused = true;
      input.reset();
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
    own(() => {
      window.removeEventListener('keydown', onMenuKey);
    });

    const hud = mountHud(root, radarMap, streets, waypoint, ctx.debug);
    own(() => {
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
      try {
        runFrame(ctx, world, frameDt, {
          sampleInput,
          updateLook,
          fixedUpdate: fixedStep,
          render(context, ecs, dt) {
            renderScene(context, ecs, dt);
            hud.updateFps(dt);
            hud.setStats(context.renderer.drawCalls(), context.physics.bodyCount());
            hud.setLocked(context.input.pointerLocked);
            const aim = context.input.snapshot();
            hud.setAim(aim.aimX, aim.aimY, context.input.pointerLocked);
            const state = context.net?.state() ?? null;
            hud.setOffline(context.net !== null && !context.net.connected());
            hud.setPlay(readHud(world), state?.players ?? []);
            const title = readCarTitle(world);
            if (!title) hud.setCarTitle('', '', 0, 0, false);
            else {
              const plate = context.renderer.project(title);
              hud.setCarTitle(title.name, title.detail, plate.x, plate.y, !plate.behind);
            }
            hud.setPresence(
              state && context.net
                ? {
                    selfId: context.net.selfId,
                    roster: state.roster,
                    peers: state.players.flatMap((player) => {
                      const anchor = remotePlayerMark(player.id, player.car);
                      if (!anchor) return [];
                      return [
                        {
                          ...player,
                          x: anchor.x,
                          y: anchor.y,
                          z: anchor.z,
                          driving: anchor.driving,
                        },
                      ];
                    }),
                    project: (point) => context.renderer.project(point),
                  }
                : null,
            );
            if (context.input.snapshot().debugToggle) hud.toggle();
            if (context.input.snapshot().scoreToggle) hud.toggleScore();
            if (context.input.snapshot().debugOverlay) {
              context.debug.showGraph = !context.debug.showGraph;
            }
          },
        });
        failures = 0;
      } catch (error) {
        failures += 1;
        ctx.log.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
        // One bad frame can be a glitch. Three in a row would freeze the canvas with no word.
        if (failures >= 3) {
          stop();
          mountStartMenu(root, (choice) => start(root, choice), {
            notice: 'O jogo parou por um erro. Os detalhes estão no console.',
          });
          return;
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  } catch (error) {
    stop();
    throw error;
  }
}
