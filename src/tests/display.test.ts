import { describe, expect, it } from 'vitest';
import { canvasAntialias, cappedPixelRatio, MAX_PIXEL_RATIO } from '../engine/render/display';

describe('display', () => {
  it('caps the pixel ratio at 2', () => {
    expect(cappedPixelRatio(3)).toBe(MAX_PIXEL_RATIO);
    expect(cappedPixelRatio(1.25)).toBe(1.25);
    expect(cappedPixelRatio(0)).toBe(1);
  });

  it('drops MSAA once the composer owns antialiasing', () => {
    expect(canvasAntialias(false)).toBe(true);
    expect(canvasAntialias(true)).toBe(false);
  });
});
