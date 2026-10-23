import { describe, expect, it } from 'vitest';
import {
  DAY_START,
  advanceClock,
  clockAt,
  createGameClock,
  dayFraction,
  formatClock,
} from '../sim/clock';

describe('the game clock', () => {
  it('starts at 09:00 and runs a whole day in 24 real minutes', () => {
    const clock = createGameClock();
    expect(formatClock(clock)).toBe('09:00');
    advanceClock(clock, 24 * 60);
    expect(clock.minutes).toBeCloseTo(DAY_START, 6);
  });

  it('wraps at midnight and pads the hours', () => {
    const clock = createGameClock(23 * 60 + 59);
    expect(formatClock(clock)).toBe('23:59');
    advanceClock(clock, 2);
    expect(formatClock(clock)).toBe('00:01');
    advanceClock(clock, -120);
    expect(formatClock(clock)).toBe('22:01');
  });

  it('gives the renderer 0 at midnight and 0.5 at noon', () => {
    expect(dayFraction(createGameClock(0))).toBe(0);
    expect(dayFraction(createGameClock(12 * 60))).toBe(0.5);
  });

  it('reads the room clock from seconds since the room opened', () => {
    expect(clockAt(0)).toBe(DAY_START);
    expect(clockAt(60)).toBe(DAY_START + 60);
    expect(clockAt(24 * 60 * 3 + 30)).toBe(DAY_START + 30);
  });
});
