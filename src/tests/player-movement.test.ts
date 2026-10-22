import { addComponent, addEntity, createWorld } from 'bitecs';
import { describe, expect, it } from 'vitest';
import type { GameContext } from '../game/context';
import {
  CameraRig,
  InputState,
  PhysicsRef,
  Player,
  RenderRef,
  Transform,
  Velocity,
  Mode,
} from '../game/ecs/components';
import { CITY_FLOOR } from '../content/map/island-shape';
import { sim } from '../content/sim';
import { capsuleFloor } from '../game/play/ground';
import {
  applyLocomotion,
  computePlanarVelocity,
  playerMovementSystem,
} from '../game/systems/player-movement';

describe('computePlanarVelocity', () => {
  it('returns zero when there is no stick input', () => {
    expect(computePlanarVelocity(0, 0, 0, 5)).toEqual({ x: 0, z: 0 });
  });

  it('moves forward along -Z when the camera yaw is 0', () => {
    const v = computePlanarVelocity(0, 1, 0, 4);
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.z).toBeCloseTo(-4, 5);
  });

  it('strafes to +X when the camera yaw is 0', () => {
    const v = computePlanarVelocity(1, 0, 0, 4);
    expect(v.x).toBeCloseTo(4, 5);
    expect(v.z).toBeCloseTo(0, 5);
  });

  it('turns forward with yaw and keeps diagonal input at the requested speed', () => {
    const turned = computePlanarVelocity(0, 1, Math.PI / 2, 6);
    expect(turned.x).toBeCloseTo(-6, 5);
    expect(turned.z).toBeCloseTo(0, 5);

    const diagonal = computePlanarVelocity(1, 1, 0, 5);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(5, 5);
  });
});

describe('applyLocomotion', () => {
  it('writes facing-relative velocity and a jump impulse when grounded on foot', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Player);
    addComponent(world, eid, InputState);
    addComponent(world, eid, Velocity);

    Player.mode[eid] = Mode.OnFoot;
    Player.speed[eid] = 4;
    Player.sprintSpeed[eid] = 8;
    Player.jumpSpeed[eid] = 7;
    InputState.moveX[eid] = 0;
    InputState.moveZ[eid] = 1;
    InputState.sprint[eid] = 1;
    InputState.jump[eid] = 1;
    Velocity.y[eid] = -3;

    applyLocomotion(world, eid, 0, -20, 1 / 60, true);

    expect(Velocity.x[eid]).toBeCloseTo(0, 5);
    expect(Velocity.z[eid]).toBeCloseTo(-8, 5);
    expect(Velocity.y[eid]).toBeCloseTo(7, 5);
    expect(InputState.jump[eid]).toBe(0);
    expect(Player.facing[eid]).toBeCloseTo(0, 5);
  });

  it('strafes to +X without turning the body', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Player);
    addComponent(world, eid, InputState);
    addComponent(world, eid, Velocity);

    Player.mode[eid] = Mode.OnFoot;
    Player.speed[eid] = 4;
    InputState.sprint[eid] = 0;
    InputState.moveX[eid] = 1;
    InputState.moveZ[eid] = 0;

    applyLocomotion(world, eid, 0, -20, 1 / 60, true);

    expect(Velocity.x[eid]).toBeCloseTo(4, 5);
    expect(Player.facing[eid]).toBeCloseTo(0, 5);
  });

  it('does not move a player who is driving', () => {
    const world = createWorld();
    const eid = addEntity(world);
    addComponent(world, eid, Player);
    addComponent(world, eid, InputState);
    addComponent(world, eid, Velocity);

    Player.mode[eid] = Mode.Driving;
    InputState.moveZ[eid] = 1;
    Velocity.x[eid] = 1;
    Velocity.y[eid] = 2;
    Velocity.z[eid] = 3;

    applyLocomotion(world, eid, 0, -20, 1 / 60, true);

    expect(Velocity.x[eid]).toBe(1);
    expect(Velocity.y[eid]).toBe(2);
    expect(Velocity.z[eid]).toBe(3);
  });
});

describe('playerMovementSystem', () => {
  it('walks forward along the body facing while the camera stays put', () => {
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
    Player.speed[eid] = 4;
    Player.facing[eid] = -Math.PI / 2;
    PhysicsRef.body[eid] = 1;
    CameraRig.yaw[eid] = 0;
    InputState.moveX[eid] = 0;
    InputState.moveZ[eid] = 1;

    let floor = 0;
    const ctx = {
      time: { fixedDt: 1 / 60 },
      physics: {
        isGrounded: () => true,
        moveCharacter: () => {},
        wasBlocked: () => false,
        getTransform: (_id: number, pos: { x: number; y: number; z: number }) => {
          pos.x = 0;
          pos.y = 1;
          pos.z = 12;
        },
        raiseCharacter: (_id: number, minY: number) => {
          floor = minY;
          return false;
        },
      },
    } as unknown as GameContext;

    playerMovementSystem(ctx, world);

    expect(Velocity.x[eid]).toBeCloseTo(4, 5);
    expect(Velocity.z[eid]).toBeCloseTo(0, 5);
    expect(floor).toBeCloseTo(capsuleFloor(4 / 60, 12), 5);
  });
});

describe('capsuleFloor', () => {
  it('sits the feet on the city street', () => {
    expect(capsuleFloor(0, 12)).toBeCloseTo(
      CITY_FLOOR + sim.playerRadius + sim.playerHalfHeight,
      1,
    );
  });
});
