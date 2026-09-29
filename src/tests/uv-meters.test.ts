import { describe, expect, it } from 'vitest';
import { scaleBoxUv } from '../engine/render/materials/uv-meters';

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
