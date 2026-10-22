import type { World } from 'bitecs';
import { describe, expect, it } from 'vitest';
import { createContext } from '../app/create-context';
import { buildCostaVerde } from '../content/city';
import { sampleHeight } from '../content/map/island-shape';
import type { GameContext } from '../game/context';
import { createRapierWorld } from '../engine/physics/rapier-world';
import type { Renderer } from '../engine/render/renderer';
import {
  InputState,
  Pedestrian,
  PhysicsRef,
  Player,
  RenderRef,
  Transform,
  Traffic,
  Vehicle,
  writePose,
  Mode,
} from '../game/ecs/components';
import { pedestrians, traffic } from '../game/ecs/queries';
import { createGameWorld } from '../game/ecs/world';
import { spawnPedCrowd, syncCrowd } from '../game/features/pedestrians/crowd';
import { spawnPlayer } from '../game/features/player/spawn-player';
import { spawnTrafficPool } from '../game/features/traffic/pool';
import { spawnVehicle } from '../game/features/vehicles/spawn-vehicle';
import { clearBoard } from '../game/play/board-state';
import { interactionSystem } from '../game/systems/interaction';
import { PedState } from '../game/systems/ped-ai';
import { attachDriver } from '../game/play/drivers';
import { pedestrianSystem } from '../game/systems/pedestrians';
import { pickNext } from '../game/systems/traffic';
import { carImpactDamage } from '../game/systems/traffic-ai';
import { vehicleDriveSystem } from '../game/systems/vehicle-drive';

let nextMesh = 0;
const renderer = new Proxy(
  {},
  { get: (_target, key) => (key === 'timeOfDay' ? () => 0.5 : () => (nextMesh += 1)) },
) as unknown as Renderer;

async function scene() {
  clearBoard();
  const physics = await createRapierWorld(0);
  const ctx = createContext({
    input: { snapshot: () => ({ interact: false }) } as GameContext['input'],
    physics,
    renderer,
    nav: { load: () => undefined, find: () => 0 },
    audio: { setEngine: () => undefined } as unknown as GameContext['audio'],
    assets: {} as GameContext['assets'],
    mouseSensitivity: 0.002,
    net: null,
  });
  ctx.debug.pedDensity = 0;
  ctx.debug.trafficDensity = 0;
  const world = createGameWorld();
  spawnTrafficPool(ctx, world);
  spawnPedCrowd(ctx, world);
  return { physics, ctx, world };
}

function pool(world: World): number[] {
  const peds = [...pedestrians(world)];
  for (const eid of peds) {
    Pedestrian.active[eid] = 0;
    Pedestrian.driving[eid] = 0;
    Pedestrian.car[eid] = 0;
  }
  return peds;
}

function stand(eid: number, x: number, z: number): void {
  writePose(eid, x, sampleHeight(x, z), z);
  Pedestrian.active[eid] = 1;
  Pedestrian.health[eid] = 10;
  Pedestrian.count[eid] = 0;
  Pedestrian.corpse[eid] = 0;
  Pedestrian.stuck[eid] = 0;
}

/** One fixed step of the crowd, advancing the clock the way the game loop does. */
function walk(ctx: GameContext, world: World): void {
  pedestrianSystem(ctx, world);
  ctx.time.tick += 1;
}

/** A road node near the solo spawn and a direction along one of its edges. */
function openStreet(): { x: number; z: number; fx: number; fz: number } {
  const graph = buildCostaVerde().graph;
  let best = graph.nodes[0];
  for (const node of graph.nodes) {
    if (!best || Math.hypot(node.x, node.z - 12) < Math.hypot(best.x, best.z - 12)) best = node;
  }
  if (!best) throw new Error('grafo vazio');
  const edge = graph.edges.find((item) => item.a === best.id || item.b === best.id);
  const other = edge && graph.nodes[edge.a === best.id ? edge.b : edge.a];
  if (!other || !edge) throw new Error('nó sem aresta');
  return {
    x: best.x,
    z: best.z,
    fx: (other.x - best.x) / edge.length,
    fz: (other.z - best.z) / edge.length,
  };
}

describe('lane traffic', () => {
  it('only turns back where no street legally leads on, and never parks a one-way car', () => {
    const graph = buildCostaVerde().graph;
    for (const edge of graph.edges) {
      for (const dir of edge.oneWay ? [0] : [0, 1]) {
        if (pickNext(graph, edge, dir)) continue;
        expect(edge.oneWay).toBe(false);
        const far = dir === 0 ? edge.b : edge.a;
        for (const other of graph.edges) {
          if (other.id === edge.id || (other.a !== far && other.b !== far)) continue;
          expect(other.oneWay && other.b === far).toBe(true);
        }
      }
    }
  });

  it('takes a right-angle corner instead of a U-turn', () => {
    const graph = {
      nodes: [
        { id: 0, x: 0, z: 0 },
        { id: 1, x: 0, z: 50 },
        { id: 2, x: 50, z: 50 },
      ],
      edges: [
        {
          id: 0,
          a: 0,
          b: 1,
          lanes: 2,
          width: 7,
          speed: 10,
          oneWay: false,
          kind: 'street' as const,
          length: 50,
        },
        {
          id: 1,
          a: 1,
          b: 2,
          lanes: 2,
          width: 7,
          speed: 10,
          oneWay: false,
          kind: 'street' as const,
          length: 50,
        },
      ],
    };
    const edge = graph.edges[0];
    if (!edge) throw new Error('sem aresta');
    expect(pickNext(graph, edge, 0)).toEqual({ edge: 1, dir: 0 });
  });

  it('keeps the speed of a stolen lane car instead of zeroing it', async () => {
    const { physics, ctx, world } = await scene();
    const car = [...traffic(world)][0] ?? -1;
    const player = spawnPlayer(ctx, world, { name: 'test', x: 0, y: 3, z: 12 });
    Player.mode[player] = Mode.Driving;
    Player.vehicle[player] = car;
    Vehicle.speed[car] = 12;
    vehicleDriveSystem(ctx, world);
    expect(Vehicle.speed[car]).toBe(12);
    physics.dispose();
  });

  it('stops a lane car when it is stolen', async () => {
    const { physics, ctx, world } = await scene();
    pool(world);
    const car = [...traffic(world)][0] ?? -1;
    const body = PhysicsRef.body[car] ?? 0;
    physics.setBodyEnabled(body, true);
    physics.setTransform(body, { x: 0, y: 3, z: 15 }, { x: 0, y: 0, z: 0, w: 1 });
    writePose(car, 0, 3, 15);
    Traffic.active[car] = 1;
    Traffic.mode[car] = 0;
    Traffic.speed[car] = 9;
    const player = spawnPlayer(ctx, world, { name: 'test', x: 0, y: 3, z: 12 });
    InputState.interact[player] = 1;
    interactionSystem(ctx, world);
    expect(Player.mode[player]).toBe(Mode.Boarding);
    expect(Traffic.speed[car]).toBe(0);
    physics.dispose();
  });

  it('turns a recycled wreck kinematic again', async () => {
    const physics = await createRapierWorld(-9.81);
    const body = physics.createKinematicBox({
      position: { x: 0, y: 50, z: 0 },
      halfExtents: { x: 1, y: 0.7, z: 2 },
    });
    physics.promoteDynamic(body, 400);
    physics.demoteKinematic(body);
    for (let step = 0; step < 60; step += 1) physics.step(1 / 60);
    const at = { x: 0, y: 0, z: 0 };
    physics.getTransform(body, at, { x: 0, y: 0, z: 0, w: 1 });
    expect(at.y).toBeCloseTo(50, 3);
    physics.dispose();
  });
});

describe('pedestrians', () => {
  it('drops a mesh slot it no longer owns, even as a driver far away', async () => {
    const { physics, ctx, world } = await scene();
    const [ped] = pool(world);
    if (ped === undefined) throw new Error('sem pedestre');
    stand(ped, 0, 14);
    syncCrowd(ctx, world, 0, 12, 0);
    expect(RenderRef.mesh[ped]).not.toBe(0);
    Pedestrian.driving[ped] = 1;
    writePose(ped, 0, 0, 200);
    syncCrowd(ctx, world, 0, 12, 0);
    expect(RenderRef.mesh[ped]).toBe(0);
    physics.dispose();
  });

  it('gives up a head-on standoff instead of freezing', async () => {
    const { physics, ctx, world } = await scene();
    const [a, b] = pool(world);
    if (a === undefined || b === undefined) throw new Error('sem pedestres');
    const street = openStreet();
    stand(a, street.x, street.z);
    stand(b, street.x + street.fx * 3, street.z + street.fz * 3);
    Pedestrian.state[a] = PedState.Walk;
    Pedestrian.tx[a] = street.x + street.fx * 12;
    Pedestrian.tz[a] = street.z + street.fz * 12;
    Pedestrian.state[b] = PedState.Walk;
    Pedestrian.tx[b] = street.x - street.fx * 9;
    Pedestrian.tz[b] = street.z - street.fz * 9;
    const gaveUp = new Set<number>();
    for (let step = 0; step < 180; step += 1) {
      walk(ctx, world);
      for (const eid of [a, b]) if (Pedestrian.state[eid] === PedState.Idle) gaveUp.add(eid);
    }
    expect(gaveUp.size).toBe(2);
    physics.dispose();
  });

  it('walks past a corpse', async () => {
    const { physics, ctx, world } = await scene();
    const [walker, body] = pool(world);
    if (walker === undefined || body === undefined) throw new Error('sem pedestres');
    const street = openStreet();
    stand(walker, street.x, street.z);
    stand(body, street.x + street.fx * 2, street.z + street.fz * 2);
    Pedestrian.health[body] = 0;
    Pedestrian.corpse[body] = 30;
    Pedestrian.state[walker] = PedState.Walk;
    Pedestrian.tx[walker] = street.x + street.fx * 6;
    Pedestrian.tz[walker] = street.z + street.fz * 6;
    for (let step = 0; step < 240; step += 1) walk(ctx, world);
    const along =
      ((Transform.px[walker] ?? 0) - street.x) * street.fx +
      ((Transform.pz[walker] ?? 0) - street.z) * street.fz;
    expect(along).toBeGreaterThan(3);
    physics.dispose();
  });

  it('does not report a car resting on a corpse as a new hit every tick', async () => {
    const { physics, ctx, world } = await scene();
    const [corpse] = pool(world);
    if (corpse === undefined) throw new Error('sem pedestre');
    const street = openStreet();
    const ride = spawnVehicle(ctx, world, {
      x: street.x,
      y: sampleHeight(street.x, street.z) + 1,
      z: street.z,
      yaw: 0,
    });
    const player = spawnPlayer(ctx, world, { name: 'test', x: street.x, y: 3, z: street.z });
    Player.mode[player] = Mode.Driving;
    Player.vehicle[player] = ride;
    Vehicle.speed[ride] = 3;
    stand(corpse, street.x + 0.5, street.z);
    Pedestrian.health[corpse] = 0;
    Pedestrian.corpse[corpse] = 30;
    let hits = 0;
    ctx.events.on('pedestrian:hit', () => (hits += 1));
    for (let step = 0; step < 60; step += 1) walk(ctx, world);
    expect(hits).toBe(0);
    physics.dispose();
  });

  it('keeps the crowd around the car, not the body left at the door', async () => {
    const { physics, ctx, world } = await scene();
    const [ped] = pool(world);
    if (ped === undefined) throw new Error('sem pedestre');
    const graph = buildCostaVerde().graph;
    const far = graph.nodes.find((node) => Math.hypot(node.x, node.z - 12) > 150);
    if (!far) throw new Error('sem nó longe');
    const player = spawnPlayer(ctx, world, { name: 'test', x: 0, y: 3, z: 12 });
    const ride = spawnVehicle(ctx, world, {
      x: far.x,
      y: sampleHeight(far.x, far.z) + 1,
      z: far.z,
      yaw: 0,
    });
    Player.mode[player] = Mode.Driving;
    Player.vehicle[player] = ride;
    stand(ped, far.x + 4, far.z);
    Pedestrian.state[ped] = PedState.Idle;
    Pedestrian.wait[ped] = 5;
    walk(ctx, world);
    expect(Pedestrian.active[ped]).toBe(1);
    physics.dispose();
  });

  it('hurts a person the car drives into, like the room server does', async () => {
    const { physics, ctx, world } = await scene();
    const [ped] = pool(world);
    if (ped === undefined) throw new Error('sem pedestre');
    const street = openStreet();
    const ground = sampleHeight(street.x, street.z);
    const ride = spawnVehicle(ctx, world, { x: street.x, y: ground + 1, z: street.z, yaw: 0 });
    const player = spawnPlayer(ctx, world, { name: 'test', x: street.x, y: 3, z: street.z });
    Player.mode[player] = Mode.Driving;
    Player.vehicle[player] = ride;
    stand(ped, street.x, street.z + 1);
    let hits = 0;
    ctx.events.on('pedestrian:hit', () => (hits += 1));

    Vehicle.speed[ride] = 2;
    walk(ctx, world);
    expect(Pedestrian.health[ped]).toBe(10);

    Vehicle.speed[ride] = 12;
    walk(ctx, world);
    expect(Pedestrian.health[ped]).toBe(10 - carImpactDamage(12));
    walk(ctx, world);
    expect(Pedestrian.health[ped]).toBe(10 - carImpactDamage(12));
    expect(hits).toBe(1);

    Vehicle.speed[ride] = 20;
    for (let step = 0; step < 40; step += 1) {
      writePose(ped, street.x, ground, street.z + 1);
      walk(ctx, world);
    }
    expect(Pedestrian.health[ped]).toBe(0);
    expect(Pedestrian.state[ped]).toBe(PedState.Down);
    physics.dispose();
  });

  it('clears a leftover corpse timer when a pooled ped becomes a driver', async () => {
    const { physics, world } = await scene();
    pool(world);
    const [first] = [...pedestrians(world)];
    if (first === undefined) throw new Error('sem pedestre');
    Pedestrian.corpse[first] = 4;
    Pedestrian.cool[first] = 1;
    Pedestrian.swing[first] = 0.3;
    const car = [...traffic(world)][0] ?? -1;
    expect(attachDriver(world, car, 0, 0, 0, 0, 1)).toBe(true);
    expect(Pedestrian.car[first]).toBe(car);
    expect(Pedestrian.corpse[first]).toBe(0);
    expect(Pedestrian.cool[first]).toBe(0);
    expect(Pedestrian.swing[first]).toBe(0);
    physics.dispose();
  });
});
