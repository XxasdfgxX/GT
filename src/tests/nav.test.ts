import { describe, expect, it } from 'vitest';
import { createCity } from '../content/city';
import type { NavQuad } from '../engine/nav/nav-mesh';
import {
  QUAD_REACH,
  buildQuadGraph,
  components,
  createQuadNav,
  gapBetween,
} from '../engine/nav/quad-graph-nav';

function square(x: number, z: number, half: number): NavQuad {
  return {
    ax: x - half,
    az: z - half,
    bx: x + half,
    bz: z - half,
    cx: x + half,
    cz: z + half,
    dx: x - half,
    dz: z + half,
    y: 0,
  };
}

function isConvex(q: NavQuad): boolean {
  const p = [
    [q.ax, q.az],
    [q.bx, q.bz],
    [q.cx, q.cz],
    [q.dx, q.dz],
  ] as const;
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const [x0, z0] = p[i] ?? [0, 0];
    const [x1, z1] = p[(i + 1) % 4] ?? [0, 0];
    const [x2, z2] = p[(i + 2) % 4] ?? [0, 0];
    const cross = (x1 - x0) * (z2 - z1) - (z1 - z0) * (x2 - x1);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

describe('quad graph', () => {
  it('measures touching, overlapping and separate quads', () => {
    expect(gapBetween(square(0, 0, 1), square(2, 0, 1))).toBeCloseTo(0, 9);
    expect(gapBetween(square(0, 0, 1), square(1.5, 0, 1))).toBe(0);
    expect(gapBetween(square(0, 0, 1), square(2.5, 0, 1))).toBeCloseTo(0.5, 9);
  });

  it('walks from one street to the next through the gap between pieces', () => {
    const nav = createQuadNav();
    // A row of three pieces with a fourth off the far end; the first cannot reach the last.
    nav.load([square(0, 0, 1), square(2.1, 0, 1), square(4.2, 0, 1), square(4.2, 2.1, 1)]);
    const xs = new Float32Array(8);
    const zs = new Float32Array(8);
    const count = nav.find(0, 0, 0, 4.2, 0, 2.1, xs, zs, 0, 8);
    expect(count).toBe(3);
    expect([xs[0], zs[0]]).toEqual([expect.closeTo(1.05, 5), expect.closeTo(0, 5)]);
    expect([xs[count - 1], zs[count - 1]]).toEqual([
      expect.closeTo(4.2, 5),
      expect.closeTo(2.1, 5),
    ]);
  });

  it('finds no way across a gap wider than the reach, or to a point off the sidewalk', () => {
    const nav = createQuadNav();
    nav.load([square(0, 0, 1), square(2 + QUAD_REACH + 0.5, 0, 1)]);
    const xs = new Float32Array(8);
    const zs = new Float32Array(8);
    expect(nav.find(0, 0, 0, 2 + QUAD_REACH + 0.5, 0, 0, xs, zs, 0, 8)).toBe(0);
    expect(nav.find(0, 0, 0, 40, 0, 40, xs, zs, 0, 8)).toBe(0);
  });
});

describe('city sidewalks', () => {
  const walks = createCity().walks;

  it('lays only convex walk pieces', () => {
    for (const quad of walks) expect(isConvex(quad)).toBe(true);
  });

  it('joins every sidewalk, corner and crosswalk into one walkable network', () => {
    const groups = new Set(components(buildQuadGraph(walks)));
    expect(groups.size).toBe(1);
  });

  it('finds a path between any two sidewalks a short walk apart, ending at the target', () => {
    const nav = createQuadNav();
    nav.load(walks);
    const sidewalks = walks.filter((quad) => !quad.crosswalk);
    const xs = new Float32Array(64);
    const zs = new Float32Array(64);
    let tried = 0;
    for (let i = 0; i < sidewalks.length; i += 9) {
      for (let j = i + 4; j < sidewalks.length; j += 37) {
        const a = sidewalks[i];
        const b = sidewalks[j];
        if (!a || !b) continue;
        const ax = (a.ax + a.cx) / 2;
        const az = (a.az + a.cz) / 2;
        const bx = (b.ax + b.cx) / 2;
        const bz = (b.az + b.cz) / 2;
        if (Math.hypot(ax - bx, az - bz) > 80) continue;
        tried += 1;
        const count = nav.find(ax, a.y, az, bx, b.y, bz, xs, zs, 0, 64);
        expect(count).toBeGreaterThan(0);
        expect(xs[count - 1]).toBeCloseTo(bx, 4);
        expect(zs[count - 1]).toBeCloseTo(bz, 4);
      }
    }
    expect(tried).toBeGreaterThan(50);
  });
});
