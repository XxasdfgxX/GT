import { describe, expect, it } from 'vitest';
import { approachPoint, driverDoor, facingYaw, stepToward } from '../game/play/board';

describe('boarding approach', () => {
  it('puts the driver door on the left when the nose points down +Z', () => {
    const door = driverDoor(10, 20, 0, 1.6);
    expect(door.x).toBeCloseTo(8.4, 5);
    expect(door.z).toBeCloseTo(20, 5);
  });

  it("walks toward the door and stops at arm's reach", () => {
    const first = stepToward(0, 0, 0, 4, 2, 0.5);
    expect(first.arrived).toBe(false);
    expect(first.z).toBeCloseTo(1, 5);
    const last = stepToward(0, 3.7, 0, 4, 2, 0.5);
    expect(last.arrived).toBe(true);
    expect(last.z).toBeCloseTo(4, 5);
  });

  it('walks a straight line and does not chase a moving target', () => {
    const early = approachPoint(0, 0, 0, 9, 4.5, 0.5);
    expect(early.arrived).toBe(false);
    expect(early.x).toBeCloseTo(0, 5);
    expect(early.z).toBeCloseTo(2.25, 5);
    const done = approachPoint(0, 0, 0, 9, 4.5, 3);
    expect(done.arrived).toBe(true);
    expect(done.z).toBeCloseTo(9, 5);
  });

  it('faces the car from the door', () => {
    expect(facingYaw(8.4, 20, 10, 20)).toBeCloseTo(Math.PI / 2, 5);
  });
});
