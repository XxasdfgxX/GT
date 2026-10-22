import { addComponent } from 'bitecs';
import { describe, expect, it } from 'vitest';
import { createContext } from '../app/create-context';
import { sampleHeight } from '../content/map/island-shape';
import { createRapierWorld } from '../engine/physics/rapier-world';
import type { Renderer } from '../engine/render/renderer';
import type { GameContext } from '../game/context';
import { Mode, Player, Traffic, TrafficMode, Vehicle } from '../game/ecs/components';
import { createGameWorld } from '../game/ecs/world';
import { spawnPlayer } from '../game/features/player/spawn-player';
import { spawnVehicle } from '../game/features/vehicles/spawn-vehicle';
import { abandonRide, boardVehicle, leaveVehicle } from '../game/play/seat';

const renderer = new Proxy({}, { get: () => () => 1 }) as unknown as Renderer;
const quiet = new Proxy({}, { get: () => () => undefined }) as GameContext['audio'];

async function street() {
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
  const y = sampleHeight(0, 5) + 1;
  const player = spawnPlayer(ctx, world, { name: 'test', x: 0, y, z: 8 });
  const ride = spawnVehicle(ctx, world, { x: 0, y, z: 5, yaw: 0 }, 'sedan');
  // A lane car taken at speed, as the steal leaves it.
  addComponent(world, ride, Traffic);
  Traffic.mode[ride] = TrafficMode.Player;
  Traffic.speed[ride] = 9;
  Vehicle.speed[ride] = 9;
  return { ctx, world, player, ride, physics };
}

describe('the driver seat', () => {
  it('parks a stolen lane car where it is left, so it does not drive off at its old speed', async () => {
    const { ctx, world, player, ride, physics } = await street();
    boardVehicle(ctx, player, ride);
    expect(Player.mode[player]).toBe(Mode.Driving);
    leaveVehicle(ctx, world, player);
    expect(Player.mode[player]).toBe(Mode.OnFoot);
    expect(Traffic.mode[ride]).toBe(TrafficMode.Parked);
    expect(Traffic.speed[ride]).toBe(0);
    expect(Vehicle.speed[ride]).toBe(0);
    physics.dispose();
  });

  it('parks it the same way when the driver dies at the wheel', async () => {
    const { ctx, world, player, ride, physics } = await street();
    boardVehicle(ctx, player, ride);
    abandonRide(ctx, world, player);
    expect(Player.mode[player]).toBe(Mode.OnFoot);
    expect(Player.vehicle[player]).toBe(0);
    expect(Traffic.mode[ride]).toBe(TrafficMode.Parked);
    expect(Vehicle.speed[ride]).toBe(0);
    physics.dispose();
  });
});
