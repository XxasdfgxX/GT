import { describe, expect, it } from 'vitest';
import { quatFromAxisAngle, quatFromYaw, quatMul } from '../engine/core/math';
import { chassisUp, headingYaw, readyToFlip, roofTime, ROOF_WAIT } from '../game/play/upright';

describe('upside-down cars', () => {
  it('reads a roof on the ground and keeps the nose heading', () => {
    const yaw = { x: 0, y: 0, z: 0, w: 1 };
    const roll = { x: 0, y: 0, z: 0, w: 1 };
    const pose = { x: 0, y: 0, z: 0, w: 1 };
    quatFromYaw(Math.PI / 2, yaw);
    quatFromAxisAngle(0, 0, 1, Math.PI, roll);
    quatMul(yaw, roll, pose);
    expect(chassisUp(0, 0, 0, 1)).toBeCloseTo(1);
    expect(chassisUp(pose.x, pose.y, pose.z, pose.w)).toBeCloseTo(-1);
    expect(headingYaw(pose.x, pose.y, pose.z, pose.w)).toBeCloseTo(Math.PI / 2);
  });

  it('waits a full second on the roof before flipping', () => {
    expect(ROOF_WAIT).toBe(1);
    let spent = roofTime(0, -1, 0.5);
    expect(readyToFlip(spent)).toBe(false);
    spent = roofTime(spent, -1, 0.5);
    expect(readyToFlip(spent)).toBe(true);
    expect(roofTime(spent, 1, 0.016)).toBe(0);
  });
});
