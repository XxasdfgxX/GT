import { describe, expect, it } from 'vitest';
import { hdriSunLength } from '../engine/render/sky';

describe('sky', () => {
  it('keeps the HDRI sun direction unit length', () => {
    expect(hdriSunLength()).toBeCloseTo(1, 4);
  });
});
