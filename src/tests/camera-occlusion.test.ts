import { describe, expect, it } from 'vitest';
import type { BoxCollider } from '../content/map/batch';
import { clearShare } from '../game/play/camera-occlusion';

const wall = (yaw = 0): BoxCollider => ({
  x: 0,
  y: 5,
  z: 5,
  hx: 4,
  hy: 5,
  hz: 1,
  yaw,
  pitch: 0,
  chunk: 0,
});

describe('camera occlusion', () => {
  it('stops at the near face of a wall between pivot and lens', () => {
    expect(clearShare([wall()], 0, 2, 0, 0, 2, 10)).toBeCloseTo(0.4, 5);
  });

  it('sees past a wall that is not in the way', () => {
    expect(clearShare([wall()], 10, 2, 0, 10, 2, 10)).toBe(1);
    expect(clearShare([wall()], 0, 12, 0, 0, 12, 10)).toBe(1);
  });

  it('follows the wall yaw', () => {
    // Turned a quarter, the 8 m face runs along z: the box spans z 1 to 9 at x 0.
    expect(clearShare([wall(Math.PI / 2)], 0, 2, -5, 0, 2, 10)).toBeCloseTo(6 / 15, 5);
  });

  it('ignores a box the pivot stands in', () => {
    expect(clearShare([wall()], 0, 2, 5, 0, 2, 10)).toBe(1);
  });
});
