import { describe, expect, it } from 'vitest';
import { createContext } from '../app/create-context';
import { carBody } from '../content/cars';
import { buildCostaVerde } from '../content/city';
import { bairroSpawns } from '../content/spawns';
import { sampleHeight } from '../content/map/island-shape';
import type { GameContext } from '../engine/core/context';
import { createRapierWorld } from '../engine/physics/rapier-world';
import type { Renderer } from '../engine/render/renderer';
import { InputState, PhysicsRef, Player, Vehicle } from '../game/ecs/components';
import { createGameWorld } from '../game/ecs/world';
import { spawnPlayer } from '../game/features/player/spawn-player';
import { spawnVehicle } from '../game/features/vehicles/spawn-vehicle';
import { clearBoard } from '../game/play/board-state';
import { boardCarSystem } from '../game/systems/board-car';
import { interactionSystem } from '../game/systems/interaction';
import { Mode } from '../game/systems/player-movement';
import { releaseFromBuildings } from '../game/systems/recover-vehicle';
import { boxExit } from '../game/systems/traffic-ai';

const renderer = {
  addModel: () => 1,
  setMeshVisible: () => undefined,
} as unknown as Renderer;

function context(physics: Awaited<ReturnType<typeof createRapierWorld>>): GameContext {
  return createContext({
    input: { snapshot: () => ({ interact: false }) } as GameContext['input'],
    physics,
    renderer,
    nav: { load: () => undefined } as unknown as GameContext['nav'],
    audio: { setEngine: () => undefined } as unknown as GameContext['audio'],
    assets: {} as GameContext['assets'],
    mouseSensitivity: 0.002,
    net: null,
  });
}

describe('entering the spawned car', () => {
  it('walks to the door and sits when W is pressed beside it', async () => {
    clearBoard();
    const physics = await createRapierWorld(0);
    const ctx = context(physics);
    const world = createGameWorld();
    const park = carSpot(0, 5);
    const ride = spawnVehicle(ctx, world, park, 'aston');
    const player = spawnPlayer(ctx, world, {
      name: 'test',
      x: park.x,
      y: park.y,
      z: park.z + 2,
    });
    InputState.interact[player] = 1;
    interactionSystem(ctx, world);
    expect(Player.mode[player]).toBe(Mode.Boarding);
    for (let step = 0; step < 360; step += 1) boardCarSystem(ctx, world);
    expect(Player.mode[player]).toBe(Mode.Driving);
    expect(Player.vehicle[player]).toBe(ride);
    expect(Vehicle.occupied[ride]).toBe(1);
    physics.dispose();
  });

  it('leaves a parked car where it spawned, even inside a building', async () => {
    const physics = await createRapierWorld(0);
    const ctx = context(physics);
    const world = createGameWorld();
    const park = buriedPark();
    const ride = spawnVehicle(ctx, world, park, 'aston');
    Vehicle.occupied[ride] = 0;
    const body = PhysicsRef.body[ride] ?? 0;
    const before = { x: 0, y: 0, z: 0 };
    const rotation = { x: 0, y: 0, z: 0, w: 1 };
    physics.getTransform(body, before, rotation);
    releaseFromBuildings(ctx, world);
    const after = { x: 0, y: 0, z: 0 };
    physics.getTransform(body, after, rotation);
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.z).toBeCloseTo(before.z, 4);
    physics.dispose();
  });
});

function buriedPark(): { x: number; y: number; z: number; yaw: number } {
  const city = buildCostaVerde();
  const shape = carBody('aston');
  for (const home of bairroSpawns(city.graph)) {
    for (let ix = -5; ix <= 5; ix += 1) {
      for (let iz = -5; iz <= 5; iz += 1) {
        const park = carSpot(home.x + ix, home.z + iz - 7);
        for (const box of city.colliders) {
          if (box.hy < 0.4) continue;
          const push = boxExit(
            park.x,
            park.z,
            park.yaw,
            shape.halfExtents.x,
            shape.halfExtents.z,
            box.x,
            box.z,
            box.yaw,
            box.hx,
            box.hz,
          );
          if (push.depth > 0.5) return park;
        }
      }
    }
  }
  throw new Error('nenhum spawn de carro enterrado');
}

/** A car facing south at a fixed spot, the old solo parking place. */
function carSpot(x: number, z: number): { x: number; y: number; z: number; yaw: number } {
  return { x, y: sampleHeight(x, z) + 1.5, z, yaw: Math.PI };
}
