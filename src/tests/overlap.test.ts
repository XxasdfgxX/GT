import { describe, expect, it } from 'vitest';
import { buildCostaVerde } from '../content/city';
import { carBody } from '../content/cars';
import { rectsOverlap } from '../content/map/blocks';
import { bairroSpawns, parkOnStreet, scatterSpawn, soloSpawn } from '../content/spawns';
import { circleHitsBox, circlesOverlap, pinsCircle, circleBoxDepth } from '../game/play/overlap';

describe('scatterSpawn', () => {
  it('drops a point inside the 10 by 10 square and keeps the name', () => {
    const start = soloSpawn();
    const placed = scatterSpawn(start, () => 0);
    expect(placed.name).toBe('solo');
    expect(placed.x).toBeCloseTo(start.x - 5, 5);
    expect(placed.z).toBeCloseTo(start.z - 5, 5);
    expect(placed.y).toBeGreaterThan(1);

    const other = scatterSpawn(start, () => 1);
    expect(other.x).toBeCloseTo(start.x + 5, 5);
    expect(other.z).toBeCloseTo(start.z + 5, 5);
    expect(Math.hypot(other.x - placed.x, other.z - placed.z)).toBeGreaterThan(5);
  });
});

describe('parkOnStreet', () => {
  const city = buildCostaVerde();
  const { graph } = city;

  /** Every spot the solo menu can start from: the solo point and each scatter corner of each neighborhood. */
  function starts(): { x: number; z: number }[] {
    const points = [soloSpawn(), ...bairroSpawns(graph)];
    const out: { x: number; z: number }[] = [];
    for (const point of points) {
      for (const u of [0, 0.5, 1]) {
        for (const v of [0, 0.5, 1]) out.push(scatterSpawn(point, nextOf([u, v])));
      }
    }
    return out;
  }

  function nextOf(values: number[]): () => number {
    let i = 0;
    return () => values[i++ % values.length] ?? 0;
  }

  /** Lateral distance from the car center to its street's centerline, and the street. */
  function onStreet(spot: { x: number; z: number; yaw: number }) {
    for (const edge of graph.edges) {
      const a = graph.nodes[edge.a];
      const b = graph.nodes[edge.b];
      if (!a || !b) continue;
      const fx = (b.x - a.x) / edge.length;
      const fz = (b.z - a.z) / edge.length;
      const along = (spot.x - a.x) * fx + (spot.z - a.z) * fz;
      const lateral = (spot.x - a.x) * fz - (spot.z - a.z) * fx;
      const aligned = Math.abs(Math.sin(spot.yaw - Math.atan2(fx, fz))) < 1e-6;
      if (along > 0 && along < edge.length && Math.abs(lateral) < edge.width / 2 && aligned) {
        return { edge, along, lateral };
      }
    }
    return null;
  }

  it('parks on the asphalt, along the street, from every solo start', () => {
    const half = carBody('aston').halfExtents;
    for (const start of starts()) {
      const spot = parkOnStreet(city, start, half);
      const street = onStreet(spot);
      expect(street, `start ${start.x.toFixed(1)}, ${start.z.toFixed(1)}`).not.toBeNull();
      if (!street) continue;
      // The whole body stays inside the asphalt.
      expect(Math.abs(street.lateral) + half.x).toBeLessThan(street.edge.width / 2);
      // Clear of the junction boxes at both ends.
      expect(street.along).toBeGreaterThan(half.z + 9);
      expect(street.along).toBeLessThan(street.edge.length - half.z - 9);
    }
  });

  it('starts clear of buildings, parked props and the player', () => {
    const half = carBody('bmw').halfExtents;
    for (const start of starts()) {
      const spot = parkOnStreet(city, start, half);
      const body = { x: spot.x, z: spot.z, hx: half.x, hz: half.z, yaw: spot.yaw };
      for (const box of city.colliders) {
        if (box.hy < 0.4) continue;
        expect(rectsOverlap(body, box)).toBe(false);
      }
      expect(circleHitsBox(start.x, start.z, 0.5, spot.x, spot.z, half.x, half.z, spot.yaw)).toBe(
        false,
      );
      expect(spot.y).toBeGreaterThan(1);
    }
  });

  it('faces the traffic on its side of a two-way street', () => {
    const half = carBody('aston').halfExtents;
    for (const start of starts()) {
      const spot = parkOnStreet(city, start, half);
      const street = onStreet(spot);
      if (!street || street.edge.oneWay) continue;
      const a = graph.nodes[street.edge.a];
      const b = graph.nodes[street.edge.b];
      if (!a || !b) continue;
      const forward = Math.atan2(b.x - a.x, b.z - a.z);
      const withAtoB = Math.cos(spot.yaw - forward) > 0;
      // Right-hand traffic: right of a→b drives a→b.
      expect(withAtoB).toBe(street.lateral > 0);
    }
  });
});

describe('circleHitsBox', () => {
  it('hits the box depth along +Z when yaw is 0', () => {
    expect(circleHitsBox(0, 1.9, 0, 0, 0, 1, 2, 0)).toBe(true);
    expect(circleHitsBox(0, 2.2, 0, 0, 0, 1, 2, 0)).toBe(false);
    expect(circleHitsBox(1.2, 0, 0, 0, 0, 1, 2, 0)).toBe(false);
    expect(circleHitsBox(1.2, 0, 0.3, 0, 0, 1, 2, 0)).toBe(true);
  });

  it('turns the depth onto +X when yaw is a quarter turn', () => {
    expect(circleHitsBox(1.9, 0, 0, 0, 0, 1, 2, Math.PI / 2)).toBe(true);
    expect(circleHitsBox(2.2, 0, 0, 0, 0, 1, 2, Math.PI / 2)).toBe(false);
  });
});

describe('circlesOverlap', () => {
  it('is true only inside the reach', () => {
    expect(circlesOverlap(0, 0, 0.5, 0, 0.8)).toBe(true);
    expect(circlesOverlap(0, 0, 2, 0, 0.8)).toBe(false);
  });
});

describe('pinsCircle', () => {
  it('blocks a step into someone and allows a step back out', () => {
    expect(pinsCircle(2, 0, 0.4, 0, 0, 0, 0.8)).toBe(true);
    expect(pinsCircle(0.2, 0, 0.5, 0, 0, 0, 0.8)).toBe(false);
  });
});

describe('circleBoxDepth', () => {
  it('measures how far a circle sits inside a box', () => {
    expect(circleBoxDepth(0, 0, 0.3, 0, 0, 1, 2, 0)).toBeCloseTo(1.3, 5);
    expect(circleBoxDepth(5, 0, 0.3, 0, 0, 1, 2, 0)).toBe(0);
  });
});
