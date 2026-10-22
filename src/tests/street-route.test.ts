import { describe, expect, it } from 'vitest';
import { createCity } from '../content/city';
import {
  ROUTE_REFRESH,
  createRouteCache,
  indexStreets,
  routeOnStreets,
  type StreetMap,
} from '../ui/street-route';

const corner: StreetMap = {
  nodes: [
    { x: 0, z: 10 },
    { x: 0, z: 0 },
    { x: 40, z: 0 },
  ],
  edges: [
    { a: 0, b: 1, length: 10 },
    { a: 1, b: 2, length: 40 },
  ],
};

const split: StreetMap = {
  nodes: [
    { x: 0, z: 0 },
    { x: 0, z: 10 },
    { x: 200, z: 0 },
    { x: 200, z: 10 },
  ],
  edges: [
    { a: 0, b: 1, length: 10 },
    { a: 2, b: 3, length: 10 },
  ],
};

describe('street route', () => {
  it('turns the corner instead of cutting across the block', () => {
    const route = routeOnStreets(indexStreets(corner), 0, 10, 40, 0);
    expect(route.some((point) => Math.hypot(point.x, point.z) <= 0.01)).toBe(true);
  });

  it('stays on a vertical edge', () => {
    const road: StreetMap = {
      nodes: [
        { x: 0, z: 0 },
        { x: 0, z: 100 },
      ],
      edges: [{ a: 0, b: 1, length: 100 }],
    };
    const route = routeOnStreets(indexStreets(road), 0, 20, 0, 70);
    for (const point of route) expect(Math.abs(point.x)).toBeLessThanOrEqual(1);
  });

  it('falls back to a straight line when the streets do not connect', () => {
    const route = routeOnStreets(indexStreets(split), 5, 5, 205, 5);
    expect(route).toEqual([
      { x: 5, z: 5 },
      { x: 0, z: 5 },
      { x: 200, z: 5 },
      { x: 205, z: 5 },
    ]);
  });

  it('follows Costa Verde edges between nodes that do not share a street', () => {
    const graph = createCity().graph;
    const neighbors = new Set<number>();
    for (const edge of graph.edges) {
      if (edge.a === 0) neighbors.add(edge.b);
      if (edge.b === 0) neighbors.add(edge.a);
    }
    const far = graph.nodes.find((node) => node.id !== 0 && !neighbors.has(node.id));
    expect(far).toBeDefined();
    if (!far) return;
    const start = graph.nodes[0];
    expect(start).toBeDefined();
    if (!start) return;
    const route = routeOnStreets(indexStreets(graph), start.x, start.z, far.x, far.z);
    expect(route.length).toBeGreaterThan(2);
    for (let i = 1; i < route.length; i += 1) {
      const prev = route[i - 1];
      const next = route[i];
      expect(prev && next && sharesEdge(graph, prev, next)).toBe(true);
    }
  });
});

function sharesEdge(
  graph: StreetMap,
  from: { x: number; z: number },
  to: { x: number; z: number },
): boolean {
  return graph.edges.some((edge) => {
    const a = graph.nodes[edge.a];
    const b = graph.nodes[edge.b];
    if (!a || !b) return false;
    return onSegment(from, a, b) && onSegment(to, a, b);
  });
}

function onSegment(
  point: { x: number; z: number },
  a: { x: number; z: number },
  b: { x: number; z: number },
): boolean {
  const span = Math.hypot(b.x - a.x, b.z - a.z);
  const left = Math.hypot(point.x - a.x, point.z - a.z);
  const right = Math.hypot(b.x - point.x, b.z - point.z);
  return Math.abs(left + right - span) < 0.05;
}

describe('route cache', () => {
  const index = indexStreets(corner);

  it('keeps the planned route while the player walks a little, moving only its start', () => {
    const route = createRouteCache(index);
    const first = route(1, 8, 38, 1);
    const second = route(1, 7, 38, 1);
    expect(second).toBe(first);
    expect(second[0]).toEqual({ x: 1, z: 7 });
    expect(second.slice(1)).toEqual(routeOnStreets(index, 1, 8, 38, 1).slice(1));
  });

  it('plans again after a real move or a new target', () => {
    const route = createRouteCache(index);
    const first = route(1, 8, 38, 1);
    const moved = route(1, 8 - ROUTE_REFRESH - 0.5, 38, 1);
    expect(moved).not.toBe(first);
    expect(moved).toEqual(routeOnStreets(index, 1, 8 - ROUTE_REFRESH - 0.5, 38, 1));
    const retarget = route(1, 8 - ROUTE_REFRESH - 0.5, 20, 1);
    expect(retarget).toEqual(routeOnStreets(index, 1, 8 - ROUTE_REFRESH - 0.5, 20, 1));
  });
});
