import { describe, expect, it } from 'vitest';
import {
  carBoxesOverlap,
  followSpeed,
  laneOffset,
  lightOpen,
  mustYield,
} from '../game/systems/traffic-ai';

describe('traffic lanes', () => {
  it('keeps each direction on its right-hand lane', () => {
    const forward = laneOffset(8, 2, 0, 0, false);
    const back = laneOffset(8, 2, 0, 1, false);
    expect(forward).toBeGreaterThan(0);
    expect(back).toBeLessThan(0);
    expect(Math.abs(forward)).toBeCloseTo(2);
  });

  it('stops inside the following gap and opens north-south on phase 0', () => {
    expect(followSpeed(12, 4, 14)).toBe(0);
    expect(followSpeed(12, 20, 14)).toBe(12);
    expect(lightOpen(0, 10, 'avenue', 0)).toBe(true);
    expect(lightOpen(0, 10, 'avenue', 1)).toBe(false);
    expect(lightOpen(10, 0, 'avenue', 1)).toBe(true);
    expect(mustYield('street', true)).toBe(true);
    expect(mustYield('avenue', true)).toBe(false);
  });

  it('keeps car boxes from occupying the same patch of street', () => {
    expect(carBoxesOverlap(0, 0, 0, 0.9, 2.1, 0, 0, 0, 0.9, 2.1)).toBe(true);
    expect(carBoxesOverlap(0, 0, 0, 0.9, 2.1, 3, 0, 0, 0.9, 2.1)).toBe(false);
    expect(carBoxesOverlap(0, 0, 0, 0.9, 2.1, 0, 5, 0, 0.9, 2.1)).toBe(false);
    expect(carBoxesOverlap(0, 0, 0, 0.9, 2.1, 1.2, 0, Math.PI / 2, 0.9, 2.1)).toBe(true);
  });
});
