import { describe, expect, it } from 'vitest';
import {
  HEAD_TOP_FROM_CENTER,
  PLAYER_BAR_LIFT,
  PLAYER_TAG_LIFT,
  carRoofLift,
  healthFillLayout,
} from '../game/features/health-bar';

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

  it('stacks the player bar, name, and mark above the head', () => {
    expect(PLAYER_BAR_LIFT).toBeGreaterThan(HEAD_TOP_FROM_CENTER + 0.05);
    expect(PLAYER_TAG_LIFT).toBeGreaterThan(PLAYER_BAR_LIFT);
  });

  it('keeps the player mark above a driven car roof', () => {
    expect(carRoofLift(1.5)).toBeGreaterThan(1.5 / 2 + 0.2);
  });
});
