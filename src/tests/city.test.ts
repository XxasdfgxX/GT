import { describe, expect, it } from 'vitest';
import { createCity } from '../content/city';
import { CITY_FLOOR, onIsland, sampleHeight } from '../content/map/island-shape';
import { SIDEWALK_WIDTH } from '../content/map/roads';

describe('Costa Verde island', () => {
  const city = createCity();

  it('is a long island with a lagoon, serras, and a flat city at the origin', () => {
    const heights = city.terrain.heights;
    let max = 0;
    for (const height of heights) max = Math.max(max, height);
    expect(city.terrain.sizeZ).toBeGreaterThan(city.terrain.sizeX);
    expect(max).toBeGreaterThan(40);
    expect(onIsland(0, 12)).toBe(true);
    expect(sampleHeight(0, 12)).toBeCloseTo(CITY_FLOOR, 0);
    expect(sampleHeight(160, 20)).toBeLessThan(0);
    expect(city.graph.edges.length).toBeGreaterThan(20);
  });

  it('keeps the spawn street clear and the coastal avenue wider than a side street', () => {
    const coast = city.graph.edges.filter((edge) => edge.kind === 'coast');
    const streets = city.graph.edges.filter((edge) => edge.kind === 'street');
    expect(coast.length).toBeGreaterThan(2);
    expect(Math.max(...coast.map((edge) => edge.width))).toBeGreaterThan(
      Math.max(...streets.map((edge) => edge.width)),
    );
    for (const box of city.colliders) {
      const blocked =
        Math.abs(box.x) < box.hx + 1.2 &&
        box.z > -2 - box.hz &&
        box.z < 18 + box.hz &&
        box.y - box.hy < 8;
      expect(blocked).toBe(false);
    }
  });

  it('sits buildings against the sidewalk with party-wall rows', () => {
    expect(SIDEWALK_WIDTH).toBeGreaterThanOrEqual(2);
    expect(SIDEWALK_WIDTH).toBeLessThanOrEqual(3);
    expect(city.footprints.length).toBeGreaterThan(40);
    for (const lot of city.footprints) {
      expect(lot.setback).toBeGreaterThanOrEqual(0);
      expect(lot.setback).toBeLessThanOrEqual(1);
    }
    const towers = city.footprints.filter((lot) => lot.kind === 'tower');
    const shops = city.footprints.filter((lot) => lot.kind === 'shop');
    const houses = city.footprints.filter((lot) => lot.kind === 'house');
    expect(towers.length).toBeGreaterThan(0);
    expect(shops.length).toBeGreaterThan(0);
    expect(houses.length).toBeGreaterThan(0);
  });

  it('keeps urban grass near a tenth of the basins and rebuilds the same city', () => {
    expect(city.urbanGreen).toBeGreaterThan(0.07);
    expect(city.urbanGreen).toBeLessThan(0.16);
    const again = createCity();
    expect(again.footprints.length).toBe(city.footprints.length);
    expect(again.footprints[0]?.x).toBe(city.footprints[0]?.x);
    expect(again.terrain.heights[20]).toBe(city.terrain.heights[20]);
    expect(again.urbanGreen).toBe(city.urbanGreen);
  });

  it('connects every road node', () => {
    const seen = new Set<number>([0]);
    const stack = [0];
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined) break;
      for (const edge of city.graph.edges) {
        const next = edge.a === id ? edge.b : edge.b === id ? edge.a : -1;
        if (next >= 0 && !seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    expect(seen.size).toBe(city.graph.nodes.length);
  });
});
