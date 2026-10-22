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

function addPlayerParts(world: ReturnType<typeof createGameWorld>, withCamera: boolean): number {
  const eid = addEntity(world);
  addComponent(world, eid, Player);
  addComponent(world, eid, Transform);
  addComponent(world, eid, Velocity);
  addComponent(world, eid, InputState);
  addComponent(world, eid, PhysicsRef);
  addComponent(world, eid, RenderRef);
  if (withCamera) addComponent(world, eid, CameraRig);
  return eid;
}

describe('player query', () => {
  it('finds a fully spawned player and skips one missing a part', () => {
    const world = createGameWorld();
    const full = addPlayerParts(world, true);
    const partial = addPlayerParts(world, false);
    const found = [...players(world)];
    expect(found).toContain(full);
    expect(found).not.toContain(partial);
  });

  it('sees a player spawned after the first query', () => {
    const world = createGameWorld();
    expect([...players(world)]).toHaveLength(0);
    const late = addPlayerParts(world, true);
    expect([...players(world)]).toEqual([late]);
  });

  it('keeps the players of two worlds apart', () => {
    const first = createGameWorld();
    const one = addPlayerParts(first, true);
    const second = createGameWorld();
    expect([...players(second)]).toHaveLength(0);
    expect([...players(first)]).toEqual([one]);
  });
});
