import { describe, expect, it } from 'vitest';
import {
  canvasAntialias,
  cappedPixelRatio,
  MAX_PIXEL_RATIO,
  shadowMapSize,
  sharpnessCap,
} from '../engine/render/display';

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

  it('maps shadow quality to a map size', () => {
    expect(shadowMapSize('off')).toBe(0);
    expect(shadowMapSize('low')).toBe(1024);
    expect(shadowMapSize('high')).toBe(2048);
  });

  it('caps sharpness below the device pixel ratio', () => {
    expect(sharpnessCap('low')).toBe(1);
    expect(sharpnessCap('medium')).toBe(1.5);
    expect(sharpnessCap('high')).toBe(MAX_PIXEL_RATIO);
  });
});
