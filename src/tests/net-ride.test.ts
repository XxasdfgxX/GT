import { describe, expect, it } from 'vitest';
import { createContext } from '../app/create-context';
import { sampleHeight } from '../content/map/island-shape';
import { createRapierWorld } from '../engine/physics/rapier-world';
import type { Renderer } from '../engine/render/renderer';
import type { GameContext, NetCar, NetLink, NetSnapshot } from '../game/context';
import { InputState, Mode, Player, Transform, Vehicle } from '../game/ecs/components';
import { createGameWorld } from '../game/ecs/world';
import { spawnPlayer } from '../game/features/player/spawn-player';
import { netRideSystem, resetNetRide } from '../game/systems/net-ride';

const renderer = new Proxy({}, { get: () => () => 1 }) as unknown as Renderer;
const quiet = new Proxy({}, { get: () => () => undefined }) as GameContext['audio'];

const ground = sampleHeight(0, 5);

function car(overrides: Partial<NetCar> = {}): NetCar {
  return { id: 7, variant: 0, driver: 0, x: 0, y: ground + 1, z: 5, yaw: 0, ...overrides };
}

function snapshot(seat: number, cars: NetCar[], alive = true): NetSnapshot {
  return {
    self: {
      health: alive ? 100 : 0,
      cash: 0,
      alive,
      placeSerial: 0,
      place: { x: 0, y: 0, z: 0 },
      name: 'Ana',
      kills: 0,
      npcKills: 0,
      deaths: 0,
      playerDeaths: 0,
      npcDeaths: 0,
      car: seat,
      down: 0,
    },
    players: [],
    npcs: [],
    cars,
    pickups: [],
    corpses: [],
    roster: [],
  };
}

async function room(state: () => NetSnapshot) {
  resetNetRide();
  const sent = { enter: [] as number[], exit: 0 };
  const link: NetLink = {
    selfId: 1,
    sendPose: () => undefined,
    sendPunch: () => undefined,
    sendPickup: () => undefined,
    sendEnter: (id) => {
      sent.enter.push(id);
    },
    sendExit: () => {
      sent.exit += 1;
    },
    state,
    connected: () => true,
    close: () => undefined,
  };
  const physics = await createRapierWorld(0);
  const ctx = createContext({
    input: {} as GameContext['input'],
    physics,
    renderer,
    nav: { load: () => undefined, find: () => 0 },
    audio: quiet,
    assets: {} as GameContext['assets'],
    mouseSensitivity: 0.002,
    net: link,
  });
  const world = createGameWorld();
  const eid = spawnPlayer(ctx, world, { name: 'test', x: 0, y: ground + 1, z: 8 });
  return { ctx, world, eid, sent, physics };
}

describe('riding a room car', () => {
  it('sits in the car the server seats us in, and steps out beside it when freed', async () => {
    let state = snapshot(0, [car()]);
    const { ctx, world, eid, physics } = await room(() => state);
    netRideSystem(ctx, world);
    expect(Player.mode[eid]).toBe(Mode.OnFoot);

    state = snapshot(7, [car({ driver: 1 })]);
    netRideSystem(ctx, world);
    expect(Player.mode[eid]).toBe(Mode.Driving);
    const ride = Player.vehicle[eid] ?? 0;
    expect(ride).not.toBe(0);
    expect(Vehicle.occupied[ride]).toBe(1);
    expect(Transform.pz[ride]).toBeCloseTo(5, 5);

    state = snapshot(0, [car()]);
    netRideSystem(ctx, world);
    expect(Player.mode[eid]).toBe(Mode.OnFoot);
    expect(Vehicle.occupied[ride]).toBe(0);
    expect(Player.hidden[eid]).toBe(0);
    // Out of the driver door, not inside the body.
    const away = Math.hypot((Transform.px[eid] ?? 0) - 0, (Transform.pz[eid] ?? 0) - 5);
    expect(away).toBeGreaterThan(1);
    physics.dispose();
  });

  it('reuses one ride for every car, and hides the body when killed in the seat', async () => {
    let state = snapshot(7, [car({ driver: 1 })]);
    const { ctx, world, eid, physics } = await room(() => state);
    netRideSystem(ctx, world);
    const first = Player.vehicle[eid] ?? 0;
    state = snapshot(0, [car()]);
    netRideSystem(ctx, world);
    state = snapshot(9, [car({ id: 9, variant: 2, driver: 1, x: 6 })]);
    netRideSystem(ctx, world);
    expect(Player.vehicle[eid]).toBe(first);
    expect(Transform.px[first]).toBeCloseTo(6, 5);

    state = snapshot(9, [car({ id: 9, variant: 2, driver: 1, x: 6 })], false);
    netRideSystem(ctx, world);
    expect(Player.mode[eid]).toBe(Mode.OnFoot);
    expect(Player.hidden[eid]).toBe(1);
    physics.dispose();
  });

  it('asks for the nearest open car in reach, and to leave once seated', async () => {
    let state = snapshot(0, [car({ id: 3, z: 40 }), car()]);
    const { ctx, world, eid, sent, physics } = await room(() => state);
    InputState.interact[eid] = 1;
    netRideSystem(ctx, world);
    expect(sent.enter).toEqual([7]);
    expect(InputState.interact[eid]).toBe(0);

    state = snapshot(7, [car({ driver: 1 })]);
    netRideSystem(ctx, world);
    InputState.interact[eid] = 1;
    netRideSystem(ctx, world);
    expect(sent.exit).toBe(1);
    expect(sent.enter).toEqual([7]);
    physics.dispose();
  });

  it('ignores the key when every car near is taken', async () => {
    const state = snapshot(0, [car({ driver: 4 })]);
    const { ctx, world, eid, sent, physics } = await room(() => state);
    InputState.interact[eid] = 1;
    netRideSystem(ctx, world);
    expect(sent.enter).toEqual([]);
    expect(sent.exit).toBe(0);
    physics.dispose();
  });
});
