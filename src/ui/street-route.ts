/** Shortest street path. Pure: no DOM, ECS, or Three.js. */

export interface RoutePoint {
  x: number;
  z: number;
}

export interface StreetMap {
  nodes: readonly RoutePoint[];
  edges: readonly { a: number; b: number; length: number }[];
}

export interface StreetIndex {
  map: StreetMap;
  adj: number[][];
  weight: number[][];
}

export function indexStreets(map: StreetMap): StreetIndex {
  const adj = map.nodes.map(() => [] as number[]);
  const weight = map.nodes.map(() => [] as number[]);
  for (const edge of map.edges) {
    const left = adj[edge.a];
    const right = adj[edge.b];
    const leftW = weight[edge.a];
    const rightW = weight[edge.b];
    if (!left || !right || !leftW || !rightW) continue;
    left.push(edge.b);
    leftW.push(edge.length);
    right.push(edge.a);
    rightW.push(edge.length);
  }
  return { map, adj, weight };
}

export function routeOnStreets(
  index: StreetIndex,
  playerX: number,
  playerZ: number,
  targetX: number,
  targetZ: number,
): RoutePoint[] {
  const player = { x: playerX, z: playerZ };
  const target = { x: targetX, z: targetZ };
  const from = nearest(index.map, playerX, playerZ);
  const to = nearest(index.map, targetX, targetZ);
  if (!from || !to) return dedupe([player, target]);

  const points = index.map.nodes.map((node) => ({ x: node.x, z: node.z }));
  const adj = index.adj.map((row) => row.slice());
  const weight = index.weight.map((row) => row.slice());
  const start = points.length;
  points.push(from.point);
  adj.push([]);
  weight.push([]);
  const goal = points.length;
  points.push(to.point);
  adj.push([]);
  weight.push([]);
  join(index.map, adj, weight, points, start, from.edge);
  join(index.map, adj, weight, points, goal, to.edge);
  if (from.edge === to.edge) link(adj, weight, start, goal, hypot(from.point, to.point));

  const path = dijkstra(adj, weight, start, goal);
  if (!path) return dedupe([player, from.point, to.point, target]);
  const middle: RoutePoint[] = [];
  for (const id of path) {
    const point = points[id];
    if (point) middle.push(point);
  }
  return dedupe([player, ...middle, target]);
}

function nearest(map: StreetMap, x: number, z: number): { edge: number; point: RoutePoint } | null {
  let bestEdge = -1;
  let best = Infinity;
  let point = { x, z };
  for (let i = 0; i < map.edges.length; i += 1) {
    const edge = map.edges[i];
    if (!edge) continue;
    const a = map.nodes[edge.a];
    const b = map.nodes[edge.b];
    if (!a || !b) continue;
    const snap = project(a, b, x, z);
    const distance = Math.hypot(snap.x - x, snap.z - z);
    if (distance < best) {
      best = distance;
      bestEdge = i;
      point = snap;
    }
  }
  if (bestEdge < 0) return null;
  return { edge: bestEdge, point };
}

function project(a: RoutePoint, b: RoutePoint, x: number, z: number): RoutePoint {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  if (len2 === 0) return { x: a.x, z: a.z };
  const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / len2));
  return { x: a.x + abx * t, z: a.z + abz * t };
}

function join(
  map: StreetMap,
  adj: number[][],
  weight: number[][],
  points: RoutePoint[],
  snap: number,
  edgeIndex: number,
): void {
  const edge = map.edges[edgeIndex];
  const here = points[snap];
  if (!edge || !here) return;
  link(adj, weight, snap, edge.a, hypot(here, points[edge.a]));
  link(adj, weight, snap, edge.b, hypot(here, points[edge.b]));
}

function link(adj: number[][], weight: number[][], a: number, b: number, cost: number): void {
  const left = adj[a];
  const right = adj[b];
  const leftW = weight[a];
  const rightW = weight[b];
  const safe = Number.isFinite(cost) ? cost : 0;
  if (!left || !right || !leftW || !rightW) return;
  left.push(b);
  leftW.push(safe);
  right.push(a);
  rightW.push(safe);
}

function hypot(a: RoutePoint | undefined, b: RoutePoint | undefined): number {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function dijkstra(
  adj: number[][],
  weight: number[][],
  start: number,
  goal: number,
): number[] | null {
  const count = adj.length;
  const dist = new Array<number>(count).fill(Infinity);
  const prev = new Array<number>(count).fill(-1);
  const used = new Array<boolean>(count).fill(false);
  const startDist = dist[start];
  if (startDist === undefined) return null;
  dist[start] = 0;
  for (let step = 0; step < count; step += 1) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < count; i += 1) {
      const next = dist[i] ?? Infinity;
      if (!used[i] && next < best) {
        best = next;
        u = i;
      }
    }
    if (u < 0 || u === goal) break;
    used[u] = true;
    const neighbors = adj[u] ?? [];
    const costs = weight[u] ?? [];
    for (let k = 0; k < neighbors.length; k += 1) {
      const v = neighbors[k];
      if (v === undefined || used[v]) continue;
      const stepCost = costs[k] ?? Infinity;
      const base = dist[u] ?? Infinity;
      const next = base + stepCost;
      if (next < (dist[v] ?? Infinity)) {
        dist[v] = next;
        prev[v] = u;
      }
    }
  }
  if ((dist[goal] ?? Infinity) === Infinity) return null;
  const path: number[] = [];
  let cursor = goal;
  while (cursor >= 0) {
    path.push(cursor);
    if (cursor === start) break;
    cursor = prev[cursor] ?? -1;
  }
  path.reverse();
  if (path[0] !== start) return null;
  return path;
}

function dedupe(points: RoutePoint[]): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - point.x, last.z - point.z) < 0.05) continue;
    out.push(point);
  }
  return out;
}
