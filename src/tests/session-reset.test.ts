import { describe, expect, it } from 'vitest';
import { createContext } from '../app/create-context';
import { createRapierWorld } from '../engine/physics/rapier-world';
import type { Renderer } from '../engine/render/renderer';
import type { GameContext } from '../game/context';
import { createGameWorld } from '../game/ecs/world';
import { resetCrowd, spawnPedCrowd, syncCrowd } from '../game/features/pedestrians/crowd';
import {
  resetTrafficPool,
  spawnTrafficPool,
  syncTrafficShells,
} from '../game/features/traffic/pool';
import { resetDebugView, syncDebugView } from '../game/features/world/debug-graph';

/** Hands out ids from 1, like a fresh ThreeRenderer, and records every id it is asked to touch. */
function spyRenderer() {
  const touched: number[] = [];
  let next = 0;
  const renderer = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'timeOfDay') return () => 0.5;
        if (key === 'setMeshVisible' || key === 'setInstances' || key === 'playClip') {
          return (id: number) => touched.push(id);
        }
        return () => (next += 1);
      },
    },
  ) as unknown as Renderer;
  return { renderer, touched };
}

const quiet = new Proxy({}, { get: () => () => undefined }) as GameContext['audio'];

async function context(renderer: Renderer) {
  return createContext({
    input: {} as GameContext['input'],
    physics: await createRapierWorld(0),
    renderer,
    nav: { load: () => undefined, find: () => 0 },
    audio: quiet,
    assets: {} as GameContext['assets'],
    mouseSensitivity: 0.002,
    net: null,
  });
}

describe('a session after a restart', () => {
  // A multiplayer session spawns no crowd, traffic pool, or debug view of its own.
  it('never touches mesh ids handed out by the last renderer', async () => {
    const solo = await context(spyRenderer().renderer);
    const soloWorld = createGameWorld();
    spawnPedCrowd(solo, soloWorld);
    spawnTrafficPool(solo, soloWorld);
    solo.debug.showGraph = true;
    syncDebugView(solo);

    resetCrowd();
    resetTrafficPool();
    resetDebugView();

    const next = spyRenderer();
    const online = await context(next.renderer);
    const onlineWorld = createGameWorld();
    syncCrowd(online, onlineWorld, 0, 0, 0);
    syncTrafficShells(online);
    syncDebugView(online);

    expect(next.touched.filter((id) => id !== 0)).toEqual([]);
  });
});
