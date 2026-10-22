/**
 * Sidewalk navigation as a graph of walk quads. Two quads are neighbors when they touch
 * or nearly touch: the street builder lays sidewalk, corner and crosswalk pieces side by
 * side without shared vertices, so a vertex-welded navmesh falls apart into islands.
 * A* runs over quad centers; the path goes through the gap or overlap between quads.
 */

import type { NavMesh, NavQuad } from './nav-mesh';

/** Quads closer than this are neighbors: crosswalks stop 2 cm short of the sidewalk. */
export const QUAD_REACH = 0.3;
/** A point this close to a quad counts as standing on it. */
const SNAP_REACH = 6;

export interface QuadGraph {
  count: number;
  centerX: Float64Array;
  centerZ: Float64Array;
  /** Neighbors of quad i are links[start[i] .. start[i + 1]). */
  start: Int32Array;
  links: Int32Array;
  /** Point between the two quads of each link, where a walker crosses over. */
  portalX: Float64Array;
  portalZ: Float64Array;
  quads: readonly NavQuad[];
}

export function buildQuadGraph(quads: readonly NavQuad[], reach = QUAD_REACH): QuadGraph {
  const count = quads.length;
  const centerX = new Float64Array(count);
  const centerZ = new Float64Array(count);
  const radius = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    const q = quads[i];
    if (!q) continue;
    centerX[i] = (q.ax + q.bx + q.cx + q.dx) / 4;
    centerZ[i] = (q.az + q.bz + q.cz + q.dz) / 4;
    let far = 0;
    for (const [x, z] of corners(q))
      far = Math.max(far, Math.hypot(x - centerX[i]!, z - centerZ[i]!));
    radius[i] = far;
  }
  const pairs: number[][] = Array.from({ length: count }, () => []);
  const portals: Array<Array<[number, number]>> = Array.from({ length: count }, () => []);
  for (let i = 0; i < count; i += 1) {
    const a = quads[i];
    if (!a) continue;
    for (let j = i + 1; j < count; j += 1) {
      const b = quads[j];
      if (!b) continue;
      const room = (radius[i] ?? 0) + (radius[j] ?? 0) + reach;
      const dx = (centerX[j] ?? 0) - (centerX[i] ?? 0);
      const dz = (centerZ[j] ?? 0) - (centerZ[i] ?? 0);
      if (dx * dx + dz * dz > room * room) continue;
      if (gapBetween(a, b) > reach) continue;
      const onA = closestOnQuad(a, centerX[j] ?? 0, centerZ[j] ?? 0);
      const onB = closestOnQuad(b, centerX[i] ?? 0, centerZ[i] ?? 0);
      const portal: [number, number] = [(onA[0] + onB[0]) / 2, (onA[1] + onB[1]) / 2];
      pairs[i]?.push(j);
      portals[i]?.push(portal);
      pairs[j]?.push(i);
      portals[j]?.push(portal);
    }
  }
  const start = new Int32Array(count + 1);
  for (let i = 0; i < count; i += 1) start[i + 1] = (start[i] ?? 0) + (pairs[i]?.length ?? 0);
  const total = start[count] ?? 0;
  const links = new Int32Array(total);
  const portalX = new Float64Array(total);
  const portalZ = new Float64Array(total);
  for (let i = 0; i < count; i += 1) {
    const base = start[i] ?? 0;
    pairs[i]?.forEach((j, k) => {
      links[base + k] = j;
      portalX[base + k] = portals[i]?.[k]?.[0] ?? 0;
      portalZ[base + k] = portals[i]?.[k]?.[1] ?? 0;
    });
  }
  return { count, centerX, centerZ, start, links, portalX, portalZ, quads };
}

/** Group id per quad; quads with the same id reach each other. */
export function components(graph: QuadGraph): Int32Array {
  const group = new Int32Array(graph.count).fill(-1);
  let next = 0;
  const stack: number[] = [];
  for (let seed = 0; seed < graph.count; seed += 1) {
    if (group[seed] !== -1) continue;
    group[seed] = next;
    stack.push(seed);
    while (stack.length > 0) {
      const at = stack.pop() ?? 0;
      for (let k = graph.start[at] ?? 0; k < (graph.start[at + 1] ?? 0); k += 1) {
        const to = graph.links[k] ?? 0;
        if (group[to] !== -1) continue;
        group[to] = next;
        stack.push(to);
      }
    }
    next += 1;
  }
  return group;
}

export function createQuadNav(): NavMesh {
  let graph: QuadGraph | null = null;
  let cost = new Float64Array(0);
  let guess = new Float64Array(0);
  let from = new Int32Array(0);
  let via = new Int32Array(0);
  let stamp = new Uint32Array(0);
  let closed = new Uint32Array(0);
  let query = 0;
  const open = new MinHeap();
  const route: number[] = [];

  return {
    load(quads) {
      graph = buildQuadGraph(quads);
      const count = graph.count;
      cost = new Float64Array(count);
      guess = new Float64Array(count);
      from = new Int32Array(count);
      via = new Int32Array(count);
      stamp = new Uint32Array(count);
      closed = new Uint32Array(count);
    },
    find(x0, _y0, z0, x1, _y1, z1, outX, outZ, offset, cap) {
      if (!graph || cap <= 0) return 0;
      const begin = nearestQuad(graph, x0, z0);
      const goal = nearestQuad(graph, x1, z1);
      if (begin < 0 || goal < 0) return 0;
      query += 1;
      open.clear();
      stamp[begin] = query;
      cost[begin] = 0;
      from[begin] = -1;
      open.push(begin, distance(graph, begin, goal));
      let found = false;
      while (open.size > 0) {
        const at = open.pop();
        if (closed[at] === query) continue;
        closed[at] = query;
        if (at === goal) {
          found = true;
          break;
        }
        for (let k = graph.start[at] ?? 0; k < (graph.start[at + 1] ?? 0); k += 1) {
          const to = graph.links[k] ?? 0;
          if (closed[to] === query) continue;
          const step = Math.hypot(
            (graph.centerX[to] ?? 0) - (graph.centerX[at] ?? 0),
            (graph.centerZ[to] ?? 0) - (graph.centerZ[at] ?? 0),
          );
          const next = (cost[at] ?? 0) + step;
          if (stamp[to] === query && next >= (cost[to] ?? Infinity)) continue;
          stamp[to] = query;
          cost[to] = next;
          from[to] = at;
          via[to] = k;
          guess[to] = next + distance(graph, to, goal);
          open.push(to, guess[to] ?? 0);
        }
      }
      if (!found) return 0;
      route.length = 0;
      for (let at = goal; at !== begin; at = from[at] ?? begin) route.push(via[at] ?? 0);
      // Portals from start to goal, then the target itself, cut to the caller's room.
      let written = 0;
      for (let k = route.length - 1; k >= 0 && written < cap - 1; k -= 1) {
        const link = route[k] ?? 0;
        outX[offset + written] = graph.portalX[link] ?? 0;
        outZ[offset + written] = graph.portalZ[link] ?? 0;
        written += 1;
      }
      outX[offset + written] = x1;
      outZ[offset + written] = z1;
      return written + 1;
    },
  };
}

function distance(graph: QuadGraph, a: number, b: number): number {
  return Math.hypot(
    (graph.centerX[b] ?? 0) - (graph.centerX[a] ?? 0),
    (graph.centerZ[b] ?? 0) - (graph.centerZ[a] ?? 0),
  );
}

/** The quad under (x, z), or the closest one within SNAP_REACH, or -1. */
function nearestQuad(graph: QuadGraph, x: number, z: number): number {
  let best = -1;
  let bestGap = SNAP_REACH;
  for (let i = 0; i < graph.count; i += 1) {
    const q = graph.quads[i];
    if (!q) continue;
    const dx = (graph.centerX[i] ?? 0) - x;
    const dz = (graph.centerZ[i] ?? 0) - z;
    if (dx * dx + dz * dz > 40 * 40) continue;
    const on = closestOnQuad(q, x, z);
    const gap = Math.hypot(on[0] - x, on[1] - z);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
      if (gap === 0) break;
    }
  }
  return best;
}

function corners(q: NavQuad): Array<[number, number]> {
  return [
    [q.ax, q.az],
    [q.bx, q.bz],
    [q.cx, q.cz],
    [q.dx, q.dz],
  ];
}

/** 0 when the convex quads overlap, else the widest separating gap on an edge normal. */
export function gapBetween(a: NavQuad, b: NavQuad): number {
  let gap = 0;
  for (const poly of [corners(a), corners(b)]) {
    for (let i = 0; i < 4; i += 1) {
      const [x0, z0] = poly[i] ?? [0, 0];
      const [x1, z1] = poly[(i + 1) % 4] ?? [0, 0];
      const length = Math.hypot(x1 - x0, z1 - z0);
      if (length < 1e-9) continue;
      const nx = -(z1 - z0) / length;
      const nz = (x1 - x0) / length;
      const [minA, maxA] = span(corners(a), nx, nz);
      const [minB, maxB] = span(corners(b), nx, nz);
      gap = Math.max(gap, minB - maxA, minA - maxB);
    }
  }
  return gap;
}

function span(poly: Array<[number, number]>, nx: number, nz: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, z] of poly) {
    const d = x * nx + z * nz;
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return [min, max];
}

/** Closest point of a convex quad to (x, z); the point itself when inside. */
function closestOnQuad(q: NavQuad, x: number, z: number): [number, number] {
  const poly = corners(q);
  let inside = true;
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const [x0, z0] = poly[i] ?? [0, 0];
    const [x1, z1] = poly[(i + 1) % 4] ?? [0, 0];
    const cross = (x1 - x0) * (z - z0) - (z1 - z0) * (x - x0);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) inside = false;
  }
  if (inside) return [x, z];
  let best: [number, number] = [x, z];
  let bestD = Infinity;
  for (let i = 0; i < 4; i += 1) {
    const [x0, z0] = poly[i] ?? [0, 0];
    const [x1, z1] = poly[(i + 1) % 4] ?? [0, 0];
    const ex = x1 - x0;
    const ez = z1 - z0;
    const len2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - x0) * ex + (z - z0) * ez) / len2));
    const px = x0 + ex * t;
    const pz = z0 + ez * t;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = [px, pz];
    }
  }
  return best;
}

/** Binary heap of (node, priority), smallest priority first. */
class MinHeap {
  private nodes: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  clear(): void {
    this.nodes.length = 0;
    this.keys.length = 0;
  }

  push(node: number, key: number): void {
    this.nodes.push(node);
    this.keys.push(key);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.keys[parent] ?? 0) <= key) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.nodes[0] ?? 0;
    const lastNode = this.nodes.pop() ?? 0;
    const lastKey = this.keys.pop() ?? 0;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.nodes.length && (this.keys[left] ?? 0) < (this.keys[smallest] ?? 0))
          smallest = left;
        if (right < this.nodes.length && (this.keys[right] ?? 0) < (this.keys[smallest] ?? 0))
          smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const node = this.nodes[a] ?? 0;
    const key = this.keys[a] ?? 0;
    this.nodes[a] = this.nodes[b] ?? 0;
    this.keys[a] = this.keys[b] ?? 0;
    this.nodes[b] = node;
    this.keys[b] = key;
  }
}
