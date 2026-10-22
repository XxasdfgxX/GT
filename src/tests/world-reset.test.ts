import { describe, expect, it } from 'vitest';
import { Pedestrian, Player, Traffic, Transform, Vehicle } from '../game/ecs/components';
import { createGameWorld } from '../game/ecs/world';

describe('a new world', () => {
  it('starts with no values left over from the last session', () => {
    createGameWorld();
    Vehicle.occupied[1] = 1;
    Player.mode[1] = 2;
    Player.vehicle[1] = 7;
    Pedestrian.driving[5] = 1;
    Pedestrian.corpse[5] = 4;
    Traffic.speed[9] = 30;
    Transform.px[3] = 120;
    createGameWorld();
    expect(Vehicle.occupied[1]).toBe(0);
    expect(Player.mode[1]).toBe(0);
    expect(Player.vehicle[1]).toBe(0);
    expect(Pedestrian.driving[5]).toBe(0);
    expect(Pedestrian.corpse[5]).toBe(0);
    expect(Traffic.speed[9]).toBe(0);
    expect(Transform.px[3]).toBe(0);
  });
});
