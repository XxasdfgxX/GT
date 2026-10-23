import { describe, expect, it } from 'vitest';
import { trafficShare, walkerShare } from '../sim/city-life';

describe('city life by the hour', () => {
  it('fills the streets at rush hour and thins them before dawn', () => {
    expect(walkerShare(8)).toBe(1);
    expect(trafficShare(17.5)).toBe(1);
    expect(walkerShare(4)).toBeLessThan(0.3);
    expect(trafficShare(4)).toBeLessThan(0.4);
  });

  it('never empties the streets, and joins up across midnight', () => {
    for (let hours = 0; hours <= 24; hours += 0.25) {
      expect(walkerShare(hours)).toBeGreaterThan(0.1);
      expect(trafficShare(hours)).toBeGreaterThan(0.1);
    }
    expect(walkerShare(0)).toBeCloseTo(walkerShare(24), 6);
    expect(trafficShare(-1)).toBeCloseTo(trafficShare(23), 6);
  });
});
