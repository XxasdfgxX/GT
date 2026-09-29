import { addComponent, addEntity } from 'bitecs';
import { describe, expect, it } from 'vitest';
import {
  CameraRig,
  InputState,
  PhysicsRef,
  Player,
  RenderRef,
  Transform,
  Velocity,
} from '../game/ecs/components';
import { players } from '../game/ecs/queries';
import { createGameWorld } from '../game/ecs/world';

describe('player query', () => {
  it('finds a fully spawned player', () => {
    const world = createGameWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Player);
    addComponent(world, eid, Transform);
    addComponent(world, eid, Velocity);
    addComponent(world, eid, InputState);
    addComponent(world, eid, PhysicsRef);
    addComponent(world, eid, RenderRef);
    addComponent(world, eid, CameraRig);
    Transform.pz[eid] = 12;
    const found = [...players(world)];
    expect(found).toContain(eid);
    expect(Transform.pz[eid]).toBe(12);
  });
});
