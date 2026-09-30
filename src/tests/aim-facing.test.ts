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
import { facePlayerToCursor } from '../game/systems/aim-facing';
import { Mode } from '../game/systems/player-movement';

function plantPlayer(): { world: ReturnType<typeof createWorld>; eid: number } {
  const world = createWorld();
  const eid = addEntity(world);
  addComponent(world, eid, Player);
  addComponent(world, eid, Transform);
  addComponent(world, eid, Velocity);
  addComponent(world, eid, InputState);
  addComponent(world, eid, PhysicsRef);
  addComponent(world, eid, RenderRef);
  addComponent(world, eid, CameraRig);
  Player.mode[eid] = Mode.OnFoot;
  Player.health[eid] = 10;
  Transform.py[eid] = 0.85;
  Transform.ppy[eid] = 0.85;
  CameraRig.x[eid] = 0;
  CameraRig.y[eid] = 8;
  CameraRig.z[eid] = 8;
  CameraRig.pivot[eid] = 0;
  return { world, eid };
}

describe('facePlayerToCursor', () => {
  it('turns the body toward the cursor on the ground', () => {
    const { world, eid } = plantPlayer();

    facePlayerToCursor(world, true, 200, 100, 200, 200, 1, 90);
    const right = Player.facing[eid] ?? 0;
    facePlayerToCursor(world, true, 0, 100, 200, 200, 1, 90);
    const left = Player.facing[eid] ?? 0;

    expect(right).toBeLessThan(0);
    expect(left).toBeGreaterThan(0);
  });

  it('keeps the last facing while driving or while the pointer is free', () => {
    const { world, eid } = plantPlayer();
    Player.facing[eid] = 1.2;
    Player.mode[eid] = Mode.Driving;
    facePlayerToCursor(world, true, 0, 100, 200, 200, 1, 90);
    expect(Player.facing[eid]).toBeCloseTo(1.2, 5);

    Player.mode[eid] = Mode.OnFoot;
    facePlayerToCursor(world, false, 0, 100, 200, 200, 1, 90);
    expect(Player.facing[eid]).toBeCloseTo(1.2, 5);
  });
});
