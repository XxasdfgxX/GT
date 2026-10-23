import { describe, expect, it } from 'vitest';
import { createContext } from '../app/create-context';
import { buildCostaVerde } from '../content/city';
import { carIds } from '../content/cars';
import { createRapierWorld } from '../engine/physics/rapier-world';
import type { Renderer } from '../engine/render/renderer';
import type { GameContext } from '../game/context';
import { Transform, writePose } from '../game/ecs/components';
import { vehicles } from '../game/ecs/queries';
import { createGameWorld } from '../game/ecs/world';
import { spawnPlayer } from '../game/features/player/spawn-player';
import {
  PARKED_POOL,
  parkedCarSystem,
  resetParkedCars,
  rollParkedModels,
  spawnParkedCars,
} from '../game/features/vehicles/parked-cars';

const renderer = new Proxy({}, { get: () => () => 1 }) as unknown as Renderer;
const quiet = new Proxy({}, { get: () => () => undefined }) as GameContext['audio'];

async function street() {
  resetParkedCars();
  const physics = await createRapierWorld(0);
  const ctx = createContext({
    input: {} as GameContext['input'],
    physics,
    renderer,
    nav: { load: () => undefined, find: () => 0 },
    audio: quiet,
    assets: {} as GameContext['assets'],
    mouseSensitivity: 0.002,
    net: null,
  });
  const world = createGameWorld();
  const city = buildCostaVerde();
  const player = spawnPlayer(ctx, world, { name: 't', x: 0, y: 3, z: 8 });
  return { ctx, world, city, player, physics };
}

function positions(world: ReturnType<typeof createGameWorld>) {
  return [...vehicles(world)].map((eid) => ({
    eid,
    x: Transform.px[eid] ?? 0,
    z: Transform.pz[eid] ?? 0,
  }));
}

describe('parked cars', () => {
  it('rolls one drivable model per car, any of them', () => {
    let n = 0;
    const models = rollParkedModels(() => (n++ % carIds.length) / carIds.length);
    expect(models).toHaveLength(PARKED_POOL);
    expect(new Set(models).size).toBe(carIds.length);
  });

  it('parks real cars on separate curbside spots near the player', async () => {
    const { ctx, world, city, physics } = await street();
    spawnParkedCars(ctx, world, { x: 0, z: 8 }, rollParkedModels(), city.parkedSpots);
    const cars = positions(world);
    expect(cars).toHaveLength(PARKED_POOL);
    for (const car of cars) {
      // Transforms are float32.
      const onSpot = city.parkedSpots.some(
        (spot) => Math.hypot(spot.x - car.x, spot.z - car.z) < 0.01,
      );
      expect(onSpot).toBe(true);
      for (const other of cars) {
        if (other.eid !== car.eid) {
          expect(Math.hypot(other.x - car.x, other.z - car.z)).toBeGreaterThan(5.9);
        }
      }
    }
    physics.dispose();
  });

  it('moves cars left far behind to spots ahead, out of sight', async () => {
    const { ctx, world, city, player, physics } = await street();
    spawnParkedCars(ctx, world, { x: 0, z: 8 }, rollParkedModels(), city.parkedSpots);
    // Walk to the other side of town.
    const far = city.parkedSpots.reduce((best, spot) =>
      Math.hypot(spot.x, spot.z) > Math.hypot(best.x, best.z) ? spot : best,
    );
    writePose(player, far.x, far.y, far.z);
    for (let step = 0; step < 90; step += 1) parkedCarSystem(ctx, world, city.parkedSpots);
    const near = positions(world).filter(
      (car) => Math.hypot(car.x - far.x, car.z - far.z) <= 160.5,
    );
    expect(near.length).toBeGreaterThan(0);
    for (const car of near) expect(Math.hypot(car.x - far.x, car.z - far.z)).toBeGreaterThan(69);
    physics.dispose();
  });
});
