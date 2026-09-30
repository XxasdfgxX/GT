import { describe, expect, it } from 'vitest';
import { healthFillLayout } from '../game/features/health-bar';

describe('health bars', () => {
  it('empties from the right and keeps the left edge fixed', () => {
    const full = healthFillLayout(1, 0);
    const half = healthFillLayout(0.5, 0);
    const fullLeft = full.x - full.width / 2;
    const halfLeft = half.x - half.width / 2;
    const fullRight = full.x + full.width / 2;
    const halfRight = half.x + half.width / 2;

    expect(fullLeft).toBeCloseTo(halfLeft);
    expect(halfRight).toBeLessThan(fullRight);
    expect(half.width).toBeCloseTo(full.width / 2);
  });
});
