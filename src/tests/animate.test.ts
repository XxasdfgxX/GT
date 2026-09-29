import { describe, expect, it } from 'vitest';
import { chooseClip, stepAction } from '../game/play/animate';

describe('on-foot animation', () => {
  it('idles, walks, and runs from speed and the sprint button', () => {
    expect(chooseClip(0, false, false, false)).toBe('idle');
    expect(chooseClip(2, false, false, false)).toBe('walk');
    expect(chooseClip(2, true, false, false)).toBe('run');
  });

  it('plays jump in the air and punch over every other clip', () => {
    expect(chooseClip(3, true, true, false)).toBe('jump');
    expect(chooseClip(3, true, true, true)).toBe('punch');
  });

  it('restarts the punch on a new press and otherwise counts down', () => {
    expect(stepAction(0.2, true, 0.016, 0.92)).toBe(0.92);
    expect(stepAction(0.5, false, 0.1, 0.92)).toBeCloseTo(0.4, 5);
    expect(stepAction(0.05, false, 0.1, 0.92)).toBe(0);
  });
});
