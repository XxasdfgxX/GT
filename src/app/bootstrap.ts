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
import { bairroSpawns, findSpawn, parkedBehind, scatterSpawn, soloSpawn } from '../content/spawns';
import { spawnMission } from '../game/features/mission/spawn-mission';
import { resetRemains } from '../game/features/corpse/remain';
import { resetRemotes, remotePlayerMark } from '../game/features/net/remotes';
import { resetNetRide } from '../game/systems/net-ride';
import { clearBoard } from '../game/play/board-state';
import { spawnPlayer } from '../game/features/player/spawn-player';
import { spawnPedCrowd } from '../game/features/pedestrians/crowd';
import { spawnTrafficPool, syncTrafficShells } from '../game/features/traffic/pool';
import { spawnVehicle } from '../game/features/vehicles/spawn-vehicle';
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
import { createPathNav } from '../engine/nav/three-pathfinding-nav';
import { createContext } from './create-context';
import { runFrame } from './loop';

let session: { stop: () => void } | null = null;

export async function start(root: HTMLElement, launch: LaunchChoice): Promise<void> {
  session?.stop();
  resetRemotes();
  resetRemains();
  resetNetRide();
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

  try {
    let connected: Awaited<ReturnType<typeof connectRoom>> | null = null;
    if (launch.mode === 'multiplayer') {
      if (!launch.roomId) throw new Error('Sala ausente');
      connected = await connectRoom(launch.roomId, launch.playerName, launch.spawn ?? '');
      cleanups.push(() => {
        connected?.link.close();
      });
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
    cleanups.push(() => {
      canvas.remove();
    });

    const assets = new AssetManager();
    cleanups.push(() => {
      assets.dispose();
    });
    const renderer = createThreeRenderer(canvas, assets, sim.cameraFov);
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
    const world = createGameWorld();
    spawnMap(ctx, city);
    for (let guard = 0; guard < 80 && streamAround(ctx, at.x, at.z, 4) > 0; guard += 1) {
      /* fill the blocks around the spawn before the first frame */
    }
    if (!connected) {
      spawnVehicle(ctx, world, parkedBehind(at), parked.id);
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
      ctx.debug.showColliders = settings.admin && settings.colliders;
      syncBuildingShells(ctx);
      syncTrafficShells(ctx);
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

    const hud = mountHud(root, radarMap, streets, waypoint, ctx.debug);
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
          const aim = context.input.snapshot();
          hud.setAim(aim.aimX, aim.aimY, context.input.pointerLocked);
          const state = context.net?.state() ?? null;
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
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  } catch (error) {
    stop();
    throw error;
  }
}
