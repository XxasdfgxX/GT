import { describe, expect, it } from 'vitest';
import { createCity } from '../content/city';
import { CITY_FLOOR, onIsland, sampleHeight, terrainSplat } from '../content/map/island-shape';
import { SIDEWALK_WIDTH, buildRoadGraph } from '../content/map/roads';
import { PLAZA_SITES, fitPlazas, rectsOverlap } from '../content/map/blocks';
import { srgbToLinear } from '../engine/core/math';

describe('Costa Verde island', () => {
  const city = createCity();

  it('is a long island with a lagoon, serras, and a flat city at the origin', () => {
    const heights = city.terrain.heights;
    let max = 0;
    for (const height of heights) max = Math.max(max, height);
    expect(city.terrain.sizeZ).toBeGreaterThan(city.terrain.sizeX);
    expect(max).toBeGreaterThan(16);
    expect(onIsland(0, 12)).toBe(true);
    expect(sampleHeight(0, 12)).toBeCloseTo(CITY_FLOOR, 0);
    expect(sampleHeight(160, 20)).toBeLessThan(0);
    expect(sampleHeight(40, 400)).toBeGreaterThan(8);
    expect(sampleHeight(20, -420)).toBeGreaterThan(4);
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

  it('never stacks two buildings or stands one in a street', () => {
    const lots = city.footprints.map((lot) => ({
      x: lot.x,
      z: lot.z,
      hx: lot.sx / 2,
      hz: lot.sz / 2,
      yaw: lot.yaw,
    }));
    let stacked = 0;
    for (let i = 0; i < lots.length; i += 1) {
      for (let j = i + 1; j < lots.length; j += 1) {
        const a = lots[i];
        const b = lots[j];
        if (a && b && rectsOverlap(a, b)) stacked += 1;
      }
    }
    expect(stacked).toBe(0);
    let inStreet = 0;
    for (const edge of city.graph.edges) {
      const a = city.graph.nodes[edge.a];
      const b = city.graph.nodes[edge.b];
      if (!a || !b) continue;
      const street = {
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        hx: edge.width / 2 + SIDEWALK_WIDTH,
        hz: edge.length / 2,
        yaw: Math.atan2(b.x - a.x, b.z - a.z),
      };
      for (const lot of lots) if (rectsOverlap(lot, street)) inStreet += 1;
    }
    expect(inStreet).toBe(0);
  });

  it('tells crossing and touching rectangles apart', () => {
    const base = { x: 0, z: 0, hx: 2, hz: 3, yaw: 0 };
    expect(rectsOverlap(base, { ...base, x: 3 })).toBe(true);
    expect(rectsOverlap(base, { ...base, x: 4 })).toBe(false);
    // Turned a quarter, hz runs along x: this one spans x 1.5 to 3.5.
    expect(rectsOverlap(base, { x: 2.5, z: 0, hx: 3, hz: 1, yaw: Math.PI / 2 })).toBe(true);
    expect(rectsOverlap(base, { x: 3.5, z: 0, hx: 3, hz: 1, yaw: Math.PI / 2 })).toBe(false);
  });

  it('lights the streets', () => {
    const lamps = city.meshes
      .filter((mesh) => mesh.emissive !== 0)
      .reduce((sum, mesh) => sum + mesh.count, 0);
    expect(lamps).toBeGreaterThan(100);
  });

  it('keeps urban grass near a tenth of the basins and rebuilds the same city', () => {
    expect(city.urbanGreen).toBeGreaterThan(0.07);
    expect(city.urbanGreen).toBeLessThan(0.2);
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

  it('keeps the serra gentle enough for a car', () => {
    let worst = 0;
    let at = '';
    for (let z = -700; z <= 800; z += 16) {
      for (let x = -280; x <= 320; x += 16) {
        const here = sampleHeight(x, z);
        const east = sampleHeight(x + 16, z);
        const north = sampleHeight(x, z + 16);
        if (here < 0 || east < 0 || north < 0) continue;
        const rise = Math.max(Math.abs(east - here), Math.abs(north - here));
        if (rise > worst) {
          worst = rise;
          at = `${x},${z} h=${here.toFixed(1)} e=${east.toFixed(1)} n=${north.toFixed(1)}`;
        }
      }
    }
    expect(worst, at).toBeLessThan(3.6);
  });
});

describe('terrain splat', () => {
  it('gives every vertex weights that sum to one', () => {
    const { terrain } = createCity();
    for (let v = 0; v < terrain.rows * terrain.cols; v += 1) {
      const sum =
        (terrain.splat[v * 4] ?? 0) +
        (terrain.splat[v * 4 + 1] ?? 0) +
        (terrain.splat[v * 4 + 2] ?? 0) +
        (terrain.splat[v * 4 + 3] ?? 0);
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('paves the town floor and leaves the shoreline sand', () => {
    const out = new Float32Array(4);
    terrainSplat(0, 10, CITY_FLOOR, out, 0);
    expect(out[1]).toBeGreaterThan(0.9);
    terrainSplat(0, 0, 0, out, 0);
    expect(out[0]).toBe(1);
  });
});

describe('plazas', () => {
  it('sit inside their blocks, clear of every street and sidewalk', () => {
    const graph = buildRoadGraph();
    const plazas = fitPlazas(graph);
    expect(plazas).toHaveLength(PLAZA_SITES.length);
    for (const plaza of plazas) {
      for (const edge of graph.edges) {
        const a = graph.nodes[edge.a];
        const b = graph.nodes[edge.b];
        if (!a || !b) continue;
        const band = {
          x: (a.x + b.x) / 2,
          z: (a.z + b.z) / 2,
          hx: edge.width / 2 + SIDEWALK_WIDTH,
          hz: edge.length / 2,
          yaw: Math.atan2(b.x - a.x, b.z - a.z),
        };
        const area = { x: plaza.x, z: plaza.z, hx: plaza.sx / 2, hz: plaza.sz / 2, yaw: 0 };
        expect(rectsOverlap(area, band)).toBe(false);
      }
    }
  });
});

describe('city colors', () => {
  it('are converted from sRGB hex to the linear values instances are read as', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 6);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214, 3);
  });
});
