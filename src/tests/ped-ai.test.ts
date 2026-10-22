import { describe, expect, it } from 'vitest';
import {
  COUNTER_DAMAGE,
  HURT_SECONDS,
  applyDamage,
  canCross,
  healthBarVisible,
  hurtRemaining,
  nightFactor,
  punchHits,
  punchProfile,
  shouldFlee,
} from '../sim/ped-ai';

describe('pedestrians', () => {
  it('flees from a fast car and waits for a clear crosswalk', () => {
    expect(shouldFlee(9, 5, false)).toBe(true);
    expect(shouldFlee(3, 5, false)).toBe(false);
    expect(shouldFlee(4, 1, true)).toBe(true);
    expect(canCross(true)).toBe(false);
    expect(canCross(false)).toBe(true);
  });

  it('thins the crowd at night', () => {
    expect(nightFactor(0.5)).toBe(1);
    expect(nightFactor(0.1)).toBeLessThan(1);
    expect(nightFactor(0.9)).toBeLessThan(1);
  });

  it('hits someone in front and misses someone behind', () => {
    expect(punchHits(0, 0, 0, 0, -1.2, 1.8)).toBe(true);
    expect(punchHits(0, 0, 0, 0, 1.2, 1.8)).toBe(false);
    expect(punchHits(0, 0, 0, 0.4, 0.2, 1.8)).toBe(true);
    expect(punchHits(0, 0, 0, 4, 0, 1.8)).toBe(false);
  });

  it('splits light and heavy punches and keeps the bar for five seconds', () => {
    const light = punchProfile(false);
    const heavy = punchProfile(true);
    expect(light.damage).toBe(2);
    expect(heavy.damage).toBe(3);
    expect(light.duration).toBeLessThan(heavy.duration);
    expect(light.hitDelay).toBeLessThan(heavy.hitDelay);
    expect(applyDamage(10, light.damage)).toBe(8);
    expect(applyDamage(10, heavy.damage)).toBe(7);
    expect(applyDamage(3, COUNTER_DAMAGE)).toBe(2);
    expect(applyDamage(1, COUNTER_DAMAGE)).toBe(0);
    expect(healthBarVisible(HURT_SECONDS)).toBe(true);
    let timer = HURT_SECONDS;
    timer = hurtRemaining(timer, 4.9);
    expect(healthBarVisible(timer)).toBe(true);
    timer = hurtRemaining(timer, 0.2);
    expect(healthBarVisible(timer)).toBe(false);
    timer = HURT_SECONDS;
    expect(healthBarVisible(timer)).toBe(true);
  });
});
