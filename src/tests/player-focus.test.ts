import { addComponent, addEntity, createWorld } from 'bitecs';
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
import { playerFocus } from '../game/play/player-focus';
import { Mode } from '../game/systems/player-movement';

function spawnPlayer(world: ReturnType<typeof createWorld>, x: number, z: number): number {
  const eid = addEntity(world);
  addComponent(world, eid, Player);
  addComponent(world, eid, Transform);
  addComponent(world, eid, Velocity);
  addComponent(world, eid, InputState);
  addComponent(world, eid, PhysicsRef);
  addComponent(world, eid, RenderRef);
  addComponent(world, eid, CameraRig);
  Transform.px[eid] = x;
  Transform.pz[eid] = z;
  Player.mode[eid] = Mode.OnFoot;
  return eid;
}

describe('player focus', () => {
  it('stays on the player while they are on foot', () => {
    const world = createWorld();
    spawnPlayer(world, 4, 18);
    expect(playerFocus(world)).toEqual({ x: 4, z: 18 });
  });

  it('follows the car when the body is still where they boarded', () => {
    const world = createWorld();
    const player = spawnPlayer(world, 4, 18);
    const ride = addEntity(world);
    addComponent(world, ride, Transform);
    Transform.px[ride] = 420;
    Transform.pz[ride] = -260;
    Player.mode[player] = Mode.Driving;
    Player.vehicle[player] = ride;
    expect(playerFocus(world)).toEqual({ x: 420, z: -260 });
  });
});
