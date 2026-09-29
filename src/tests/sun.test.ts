import { describe, expect, it } from 'vitest';
import { HDRI_SUN } from '../engine/render/sky';
import { directionAtTime, snapToTexel } from '../engine/render/sun-math';

describe('sun', () => {
  it('matches the HDRI sun at midday', () => {
    const out = { x: 0, y: 0, z: 0 };
    directionAtTime(0.5, out);
    expect(out.x).toBeCloseTo(HDRI_SUN.x, 4);
    expect(out.y).toBeCloseTo(HDRI_SUN.y, 4);
    expect(out.z).toBeCloseTo(HDRI_SUN.z, 4);
  });

  it('drops the sun below the horizon at night', () => {
    const out = { x: 0, y: 0, z: 0 };
    directionAtTime(0, out);
    expect(out.y).toBeLessThan(0);
  });

  it('snaps shadow samples onto the texel grid', () => {
    expect(snapToTexel(10.2, 0.5)).toBe(10);
    expect(snapToTexel(-1.2, 0.5)).toBe(-1);
  });
});
