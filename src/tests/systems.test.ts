import type { World } from 'bitecs';
import { describe, expect, it } from 'vitest';
import { createContext } from '../app/create-context';
import { buildCostaVerde } from '../content/city';
import { chunkIndex } from '../content/map/batch';
import { sampleHeight } from '../content/map/island-shape';
import { delivery } from '../content/mission';
import { createRapierWorld } from '../engine/physics/rapier-world';
import type { InstanceBatchDesc, Renderer } from '../engine/render/renderer';
import type { GameContext } from '../game/context';
import {
  InputState,
  Mission,
  Mode,
  Pedestrian,
  PhysicsRef,
  Player,
  Traffic,
  TrafficMode,
  Transform,
  Vehicle,
} from '../game/ecs/components';
import { pedestrians, traffic } from '../game/ecs/queries';
import { createGameWorld } from '../game/ecs/world';
import { spawnMission } from '../game/features/mission/spawn-mission';
import { spawnPedCrowd } from '../game/features/pedestrians/crowd';
import { spawnPlayer } from '../game/features/player/spawn-player';
import { spawnTrafficPool } from '../game/features/traffic/pool';
import { spawnVehicle } from '../game/features/vehicles/spawn-vehicle';
import { spawnMap } from '../game/features/world/spawn-map';
import { MissionPhase } from '../game/play/mission';
import { missionSystem } from '../game/systems/mission';
import { PedState } from '../sim/ped-ai';
import { pedestrianSystem } from '../game/systems/pedestrians';
import { streamCitySystem } from '../game/systems/stream-city';
import { syncTransforms } from '../game/systems/sync-transforms';
import { trafficSystem } from '../game/systems/traffic';
import { vehicleDriveSystem } from '../game/systems/vehicle-drive';

/** Any renderer call returns a fresh id; instance batches are recorded by their matrices. */
function recordingRenderer() {
  const batches: Float32Array[] = [];
  let next = 0;
  const renderer = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'timeOfDay') return () => 0.5;
        if (key === 'addInstances') {
          return (desc: InstanceBatchDesc) => {
            batches.push(desc.matrices);
            return (next += 1);
          };
        }
        return () => (next += 1);
      },
    },
  ) as unknown as Renderer;
  return { renderer, batches };
}

const quiet = new Proxy({}, { get: () => () => undefined }) as GameContext['audio'];

async function scene(gravity = 0) {
  const physics = await createRapierWorld(gravity);
  const { renderer, batches } = recordingRenderer();
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
  ctx.debug.pedDensity = 0;
  ctx.debug.trafficDensity = 0;
  return { physics, ctx, batches, world: createGameWorld() };
}

function fixed(
  ctx: GameContext,
  world: World,
  steps: number,
  systems: Array<(c: GameContext, w: World) => void>,
) {
  for (let n = 0; n < steps; n += 1) {
    for (const system of systems) system(ctx, world);
    ctx.physics.step(ctx.time.fixedDt);
    syncTransforms(ctx, world);
    ctx.time.tick += 1;
  }
}

describe('vehicle drive', () => {
  it('pulls away on throttle and holds an empty car on the handbrake', async () => {
    const { physics, ctx, world } = await scene(-9.81);
    const ground = sampleHeight(0, 5);
    physics.createStaticBox({
      position: { x: 0, y: ground - 0.5, z: 0 },
      halfExtents: { x: 40, y: 0.5, z: 80 },
    });
    const driven = spawnVehicle(ctx, world, { x: -6, y: ground + 1.5, z: 0, yaw: 0 }, 'sedan');
    const parked = spawnVehicle(ctx, world, { x: 6, y: ground + 1.5, z: 0, yaw: 0 }, 'sedan');
    const player = spawnPlayer(ctx, world, { name: 't', x: 0, y: ground + 1, z: -20 });
    Player.mode[player] = Mode.Driving;
    Player.vehicle[player] = driven;
    Vehicle.occupied[driven] = 1;
    InputState.throttle[player] = 1;
    fixed(ctx, world, 180, [vehicleDriveSystem]);
    expect(Vehicle.speed[driven]).toBeGreaterThan(3);
    expect(Math.abs(physics.forwardSpeed(PhysicsRef.body[parked] ?? 0))).toBeLessThan(0.2);
    physics.dispose();
  });
});

describe('city streaming', () => {
  it('builds the blocks around the car, not around the body left at the door', async () => {
    const { physics, ctx, batches, world } = await scene();
    const city = buildCostaVerde();
    spawnMap(ctx, city);
    const chunkOf = new Map(city.meshes.map((mesh) => [mesh.matrices, mesh.chunk]));
    const far = city.graph.nodes.find((node) => Math.hypot(node.x, node.z - 12) > 600);
    if (!far) throw new Error('sem nó longe');
    const player = spawnPlayer(ctx, world, { name: 't', x: 0, y: 3, z: 12 });
    const ride = spawnVehicle(ctx, world, { x: far.x, y: 3, z: far.z, yaw: 0 }, 'sedan');
    Player.mode[player] = Mode.Driving;
    Player.vehicle[player] = ride;
    batches.length = 0;
    for (let n = 0; n < 40; n += 1) streamCitySystem(ctx, world);
    const built = new Set(batches.map((matrices) => chunkOf.get(matrices)));
    expect(built.has(chunkIndex(far.x, far.z))).toBe(true);
    expect(built.has(chunkIndex(0, 12))).toBe(false);
    physics.dispose();
  });
});

describe('mission', () => {
  it('picks the crate up on foot and finishes when the car reaches the pad', async () => {
    const { physics, ctx, world } = await scene();
    const mission = spawnMission(ctx, world);
    const player = spawnPlayer(ctx, world, {
      name: 't',
      x: delivery.pickup.x,
      y: 3,
      z: delivery.pickup.z,
    });
    missionSystem(ctx, world);
    expect(Mission.phase[mission]).toBe(MissionPhase.Deliver);
    const ride = spawnVehicle(ctx, world, {
      x: delivery.dropoff.x,
      y: 3,
      z: delivery.dropoff.z,
      yaw: 0,
    });
    Player.mode[player] = Mode.Driving;
    Player.vehicle[player] = ride;
    missionSystem(ctx, world);
    expect(Mission.phase[mission]).toBe(MissionPhase.Done);
    physics.dispose();
  });
});

describe('lane traffic', () => {
  it('fills the pool and keeps each car moving along its street', async () => {
    const { physics, ctx, world } = await scene();
    ctx.debug.trafficDensity = 1;
    spawnTrafficPool(ctx, world);
    spawnPedCrowd(ctx, world);
    spawnPlayer(ctx, world, { name: 't', x: -94.7, y: 3, z: -33.1 });
    fixed(ctx, world, 30, [trafficSystem]);
    const lane = [...traffic(world)].filter(
      (car) => Traffic.active[car] === 1 && Traffic.mode[car] === TrafficMode.Drive,
    );
    expect(lane.length).toBeGreaterThan(20);
    const before = new Map(lane.map((car) => [car, Transform.px[car] ?? 0]));
    const startZ = new Map(lane.map((car) => [car, Transform.pz[car] ?? 0]));
    fixed(ctx, world, 120, [trafficSystem]);
    const moved = lane.filter(
      (car) =>
        Math.hypot(
          (Transform.px[car] ?? 0) - (before.get(car) ?? 0),
          (Transform.pz[car] ?? 0) - (startZ.get(car) ?? 0),
        ) > 2,
    );
    // Lights and queues hold some cars; most of the street is moving.
    expect(moved.length).toBeGreaterThan(lane.length / 2);
    physics.dispose();
  });
});

describe('crowd', () => {
  it('wakes walkers near the player and sends idle ones on errands', async () => {
    const { physics, ctx, world } = await scene();
    ctx.debug.pedDensity = 0.3;
    spawnTrafficPool(ctx, world);
    spawnPedCrowd(ctx, world);
    spawnPlayer(ctx, world, { name: 't', x: -94.7, y: 3, z: -33.1 });
    fixed(ctx, world, 240, [pedestrianSystem]);
    const awake = [...pedestrians(world)].filter((eid) => Pedestrian.active[eid] === 1);
    expect(awake.length).toBe(30);
    for (const eid of awake) {
      expect(
        Math.hypot((Transform.px[eid] ?? 0) + 94.7, (Transform.pz[eid] ?? 0) + 33.1),
      ).toBeLessThan(95);
    }
    const errands = awake.filter((eid) => Pedestrian.state[eid] !== PedState.Idle);
    expect(errands.length).toBeGreaterThan(0);
    physics.dispose();
  });
});
