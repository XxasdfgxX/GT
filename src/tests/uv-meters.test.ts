import { describe, expect, it } from 'vitest';
import { glslFloat, scaleBoxUv } from '../engine/render/materials/uv-meters';

describe('uv meters', () => {
  it('scales each box face by its world size', () => {
    const uv = new Float32Array(48).fill(1);
    scaleBoxUv(uv, uv, 4, 2, 8, 2);
    expect(uv[0]).toBe(4);
    expect(uv[1]).toBe(1);
    expect(uv[16]).toBe(2);
    expect(uv[17]).toBe(4);
  });
});

describe('glslFloat', () => {
  it('always writes a float literal, so a whole-meter tile still compiles', () => {
    expect(glslFloat(1)).toBe('1.0');
    expect(glslFloat(0.25)).toBe('0.25');
    expect(glslFloat(1 / 3)).toContain('.');
    expect(glslFloat(1e-7)).toBe('1e-7');
  });
});
