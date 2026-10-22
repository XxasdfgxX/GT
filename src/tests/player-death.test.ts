import { describe, expect, it } from 'vitest';
import { createContext } from '../app/create-context';
import { parkedBehind } from '../content/spawns';
import type { GameContext } from '../engine/core/context';
import { createRapierWorld } from '../engine/physics/rapier-world';
import type { Renderer } from '../engine/render/renderer';
import { InputState, Player, Vehicle } from '../game/ecs/components';
import { createGameWorld } from '../game/ecs/world';
import { resetRemains } from '../game/features/corpse/remain';
import { spawnPlayer } from '../game/features/player/spawn-player';
import { spawnVehicle } from '../game/features/vehicles/spawn-vehicle';
import { clearBoard, currentBoard } from '../game/play/board-state';
import { boardCarSystem } from '../game/systems/board-car';
import { cashSystem } from '../game/systems/cash';
import { interactionSystem } from '../game/systems/interaction';
import { Mode } from '../game/systems/player-movement';

const renderer = {
  addModel: () => 1,
  addMesh: () => 2,
  setMeshVisible: () => undefined,
  setMeshTransform: () => undefined,
  playClip: () => undefined,
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

async function besideCar() {
  clearBoard();
  resetRemains();
  const physics = await createRapierWorld(0);
  const ctx = context(physics);
  const world = createGameWorld();
  const park = parkedBehind({ x: 0, z: 12 });
  const ride = spawnVehicle(ctx, world, park, 'aston');
  const player = spawnPlayer(ctx, world, { name: 'test', x: park.x, y: park.y, z: park.z + 2 });
  return { physics, ctx, world, ride, player };
}

/** Same order as fixedStep: interaction, cash, then the door walk. */
function steps(ctx: GameContext, world: ReturnType<typeof createGameWorld>, count: number): void {
  for (let step = 0; step < count; step += 1) {
    interactionSystem(ctx, world);
    cashSystem(ctx, world);
    boardCarSystem(ctx, world);
  }
}

describe('dying in or on the way to a car', () => {
  it('drops the door walk and respawns on foot', async () => {
    const { physics, ctx, world, ride, player } = await besideCar();
    InputState.interact[player] = 1;
    interactionSystem(ctx, world);
    expect(Player.mode[player]).toBe(Mode.Boarding);
    steps(ctx, world, 10);
    Player.health[player] = 0;
    steps(ctx, world, 150);
    expect(currentBoard()).toBeNull();
    expect(Player.mode[player]).toBe(Mode.OnFoot);
    expect(Player.vehicle[player]).toBe(0);
    expect(Vehicle.occupied[ride]).toBe(0);
    expect(Player.hidden[player]).toBe(0);
    expect(Player.health[player]).toBeGreaterThan(0);
    physics.dispose();
  });

  it('leaves the seat empty when the driver dies', async () => {
    const { physics, ctx, world, ride, player } = await besideCar();
    InputState.interact[player] = 1;
    interactionSystem(ctx, world);
    steps(ctx, world, 360);
    expect(Player.mode[player]).toBe(Mode.Driving);
    Player.health[player] = 0;
    steps(ctx, world, 150);
    expect(Player.mode[player]).toBe(Mode.OnFoot);
    expect(Player.vehicle[player]).toBe(0);
    expect(Vehicle.occupied[ride]).toBe(0);
    expect(Player.hidden[player]).toBe(0);
    physics.dispose();
  });

  it('hands a restarted session a free car even if the old one was driven', async () => {
    const first = await besideCar();
    Vehicle.occupied[first.ride] = 1;
    first.physics.dispose();
    const second = await besideCar();
    expect(second.ride).toBe(first.ride);
    expect(Vehicle.occupied[second.ride]).toBe(0);
    second.physics.dispose();
  });

  it('ignores the interact key while dead', async () => {
    const { physics, ctx, world, player } = await besideCar();
    Player.health[player] = 0;
    cashSystem(ctx, world);
    InputState.interact[player] = 1;
    interactionSystem(ctx, world);
    expect(Player.mode[player]).toBe(Mode.OnFoot);
    expect(currentBoard()).toBeNull();
    physics.dispose();
  });
});
