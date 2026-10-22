import { describe, expect, it } from 'vitest';
import { stepAimCursor } from '../engine/input/aim-cursor';
import { aimPointOnPlane, facingToward, meshYaw } from '../sim/aim-cursor';

const view = { x: 0, y: 10, z: 10 };
const focus = { x: 0, y: 0, z: 0 };

describe('stepAimCursor', () => {
  it('moves the cursor and keeps it inside the view', () => {
    expect(stepAimCursor(10, 10, 5, -4, 100, 80, false)).toEqual({ x: 15, y: 6 });
    expect(stepAimCursor(10, 10, -40, 90, 100, 80, false)).toEqual({ x: 0, y: 80 });
  });

  it('leaves the cursor where it is while the camera orbits', () => {
    expect(stepAimCursor(12, 30, 40, -20, 100, 80, true)).toEqual({ x: 12, y: 30 });
  });
});

describe('meshYaw', () => {
  it('turns the character mesh along the step', () => {
    expect(meshYaw(0, -1)).toBeCloseTo(0, 5);
    expect(meshYaw(1, 0)).toBeCloseTo(-Math.PI / 2, 5);
  });
});

describe('facingToward', () => {
  it('matches the body yaw used for walking south and east', () => {
    expect(facingToward(0, 0, 0, -4)).toBeCloseTo(0, 5);
    expect(facingToward(0, 0, 4, 0)).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('returns null when the point sits on the player', () => {
    expect(facingToward(2, 3, 2, 3)).toBeNull();
  });
});

describe('aimPointOnPlane', () => {
  it('hits the ground under the center of a downward view', () => {
    const hit = aimPointOnPlane(view, focus, 90, 100, 100, 200, 200, 0);
    expect(hit).not.toBeNull();
    expect(hit?.x).toBeCloseTo(0, 4);
    expect(hit?.z).toBeCloseTo(0, 4);
  });

  it('hits to the right when the cursor is on the right edge', () => {
    const hit = aimPointOnPlane(view, focus, 90, 200, 100, 200, 200, 0);
    expect(hit?.x).toBeCloseTo(Math.SQRT2 * 10, 4);
    expect(hit?.z).toBeCloseTo(0, 4);
    expect(facingToward(0, 0, hit?.x ?? 0, hit?.z ?? 0)).toBeCloseTo(-Math.PI / 2, 4);
  });

  it('aims along the horizon when the cursor is in the sky', () => {
    const hit = aimPointOnPlane(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 2, z: -1 },
      90,
      100,
      100,
      200,
      200,
      0,
    );
    expect(hit?.x).toBeCloseTo(0, 4);
    expect(hit?.z).toBeLessThan(0);
  });
});
