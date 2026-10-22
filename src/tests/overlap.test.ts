import { describe, expect, it } from 'vitest';
import { parkedBehind, scatterSpawn, soloSpawn } from '../content/spawns';
import { sedan } from '../content/vehicles';
import { circleHitsBox, circlesOverlap, pinsCircle, circleBoxDepth } from '../game/play/overlap';

describe('scatterSpawn', () => {
  it('drops a point inside the 10 by 10 square and keeps the name', () => {
    const start = soloSpawn();
    const placed = scatterSpawn(start, () => 0);
    expect(placed.name).toBe('solo');
    expect(placed.x).toBeCloseTo(start.x - 5, 5);
    expect(placed.z).toBeCloseTo(start.z - 5, 5);
    expect(placed.y).toBeGreaterThan(1);

    const other = scatterSpawn(start, () => 1);
    expect(other.x).toBeCloseTo(start.x + 5, 5);
    expect(other.z).toBeCloseTo(start.z + 5, 5);
    expect(Math.hypot(other.x - placed.x, other.z - placed.z)).toBeGreaterThan(5);
  });
});

describe('parkedBehind', () => {
  it('keeps the classic car when the player stands at the solo point', () => {
    const home = soloSpawn();
    const car = parkedBehind(home);
    expect(car.x).toBeCloseTo(sedan.spawn.x, 5);
    expect(car.z).toBeCloseTo(sedan.spawn.z, 5);
    expect(car.yaw).toBeCloseTo(sedan.spawnYaw, 5);
  });

  it('stays seven meters behind wherever the player stands', () => {
    const player = { x: -82.5, z: -25.7 };
    const car = parkedBehind(player);
    expect(car.x).toBeCloseTo(player.x, 5);
    expect(player.z - car.z).toBeCloseTo(7, 5);
    expect(car.yaw).toBeCloseTo(Math.PI, 5);
    expect(car.y).toBeGreaterThan(1);
  });
});

describe('circleHitsBox', () => {
  it('hits the box depth along +Z when yaw is 0', () => {
    expect(circleHitsBox(0, 1.9, 0, 0, 0, 1, 2, 0)).toBe(true);
    expect(circleHitsBox(0, 2.2, 0, 0, 0, 1, 2, 0)).toBe(false);
    expect(circleHitsBox(1.2, 0, 0, 0, 0, 1, 2, 0)).toBe(false);
    expect(circleHitsBox(1.2, 0, 0.3, 0, 0, 1, 2, 0)).toBe(true);
  });

  it('turns the depth onto +X when yaw is a quarter turn', () => {
    expect(circleHitsBox(1.9, 0, 0, 0, 0, 1, 2, Math.PI / 2)).toBe(true);
    expect(circleHitsBox(2.2, 0, 0, 0, 0, 1, 2, Math.PI / 2)).toBe(false);
  });
});

describe('circlesOverlap', () => {
  it('is true only inside the reach', () => {
    expect(circlesOverlap(0, 0, 0.5, 0, 0.8)).toBe(true);
    expect(circlesOverlap(0, 0, 2, 0, 0.8)).toBe(false);
  });
});

describe('pinsCircle', () => {
  it('blocks a step into someone and allows a step back out', () => {
    expect(pinsCircle(2, 0, 0.4, 0, 0, 0, 0.8)).toBe(true);
    expect(pinsCircle(0.2, 0, 0.5, 0, 0, 0, 0.8)).toBe(false);
  });
});

describe('circleBoxDepth', () => {
  it('measures how far a circle sits inside a box', () => {
    expect(circleBoxDepth(0, 0, 0.3, 0, 0, 1, 2, 0)).toBeCloseTo(1.3, 5);
    expect(circleBoxDepth(5, 0, 0.3, 0, 0, 1, 2, 0)).toBe(0);
  });
});
