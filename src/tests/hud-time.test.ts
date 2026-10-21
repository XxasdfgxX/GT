import { describe, expect, it } from 'vitest';
import { formatTime } from '../ui/mount-hud';

describe('mission timer', () => {
  it('rounds before splitting minutes, so it never shows 60 seconds', () => {
    expect(formatTime(59.96)).toBe('1:00.0');
    expect(formatTime(119.99)).toBe('2:00.0');
  });

  it('keeps tenths and pads the seconds', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(5.04)).toBe('0:05.0');
    expect(formatTime(61.25)).toBe('1:01.3');
    expect(formatTime(-3)).toBe('0:00.0');
  });
});
