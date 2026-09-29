import { describe, expect, it } from 'vitest';
import { buildCostaVerde } from '../content/city';
import { island, testMap } from '../content/map';
import { roadPieces } from '../game/features/world/road';

describe('Costa Verde', () => {
  const city = buildCostaVerde();

  it('is a large island with ocean around the original street', () => {
    expect(island.width).toBeGreaterThanOrEqual(900);
    expect(island.depth).toBeGreaterThanOrEqual(800);
    expect(city.solids.some((item) => item.surface === 'water')).toBe(true);
    expect(city.roads.length).toBeGreaterThan(6);
    expect(city.houses.length).toBeGreaterThanOrEqual(8);
    const south = island.centerZ - island.depth / 2;
    const north = island.centerZ + island.depth / 2;
    expect(12).toBeGreaterThan(south);
    expect(12).toBeLessThan(north);
  });

  it('keeps the spawn street clear of buildings', () => {
    const blocked = (x: number, z: number, hx: number, hz: number, y: number, hy: number) =>
      Math.abs(x) < hx + 1.2 && Math.abs(z - 8) < hz + 6 && y - hy < 3;
    for (const house of [...testMap.buildings, ...city.houses]) {
      expect(
        blocked(house.x, house.z, house.sx / 2, house.sz / 2, house.sy / 2, house.sy / 2),
      ).toBe(false);
    }
    for (const box of [...city.colliders, ...city.bounds]) {
      expect(blocked(box.x, box.z, box.hx, box.hz, box.y, box.hy)).toBe(false);
    }
    for (const item of city.solids) {
      if (!item.collide) continue;
      expect(blocked(item.x, item.z, item.sx / 2, item.sz / 2, item.y, item.sy / 2)).toBe(false);
    }
  });

  it('runs the orla across X with curbs beside it', () => {
    const orla = city.roads.find((road) => road.axis === 'x');
    expect(orla).toBeDefined();
    if (!orla) return;
    const pieces = roadPieces(orla);
    const asphalt = pieces.find((item) => item.role === 'asphalt');
    const curbs = pieces.filter((item) => item.role === 'curb');
    expect(asphalt).toBeDefined();
    if (!asphalt) return;
    expect(asphalt.z).toBeCloseTo(orla.x, 5);
    expect(asphalt.sz).toBeCloseTo(orla.width, 5);
    expect(curbs).toHaveLength(2);
    for (const curb of curbs) {
      expect(Math.abs(curb.z - asphalt.z)).toBeGreaterThan(asphalt.sz / 2);
    }
  });
});
