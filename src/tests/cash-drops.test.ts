import { describe, expect, it } from 'vitest';
import { createContext } from '../app/create-context';
import { createRapierWorld } from '../engine/physics/rapier-world';
import type { Renderer } from '../engine/render/renderer';
import type { GameContext } from '../game/context';
import { Pickup } from '../game/ecs/components';
import { pickups } from '../game/ecs/queries';
import { createGameWorld } from '../game/ecs/world';
import { DROP_LIFETIME, MAX_DROPS } from '../sim/wallet';
import { cashSystem, spawnPickup } from '../game/systems/cash';

const renderer = new Proxy({}, { get: () => () => 1 }) as unknown as Renderer;
const quiet = new Proxy({}, { get: () => () => undefined }) as GameContext['audio'];

async function scene() {
  const ctx = createContext({
    input: {} as GameContext['input'],
    physics: await createRapierWorld(0),
    renderer,
    nav: { load: () => undefined, find: () => 0 },
    audio: quiet,
    assets: {} as GameContext['assets'],
    mouseSensitivity: 0.002,
    net: null,
  });
  return { ctx, world: createGameWorld() };
}

function liveDrops(world: ReturnType<typeof createGameWorld>): number {
  let live = 0;
  for (const eid of pickups(world)) if ((Pickup.amount[eid] ?? 0) > 0) live += 1;
  return live;
}

describe('solo cash drops', () => {
  it('stop at the cap and recycle the oldest', async () => {
    const { ctx, world } = await scene();
    for (let i = 0; i < MAX_DROPS + 10; i += 1) spawnPickup(ctx, world, i * 3, 0, 0, 10);
    expect(liveDrops(world)).toBe(MAX_DROPS);
    expect(pickups(world).length).toBe(MAX_DROPS);
  });

  it('leave the street after their lifetime', async () => {
    const { ctx, world } = await scene();
    for (let i = 0; i < 5; i += 1) spawnPickup(ctx, world, i * 3, 0, 500, 10);
    const steps = Math.ceil((DROP_LIFETIME + 1) / ctx.time.fixedDt);
    for (let n = 0; n < steps; n += 1) cashSystem(ctx, world);
    expect(liveDrops(world)).toBe(0);
  });
});
