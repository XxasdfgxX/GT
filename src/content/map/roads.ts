/** Road graph for Costa Verde. Right-hand traffic reads lanes from this. */

import { z } from 'zod';
import { mulberry32 } from './rng';
import { onIsland, urbanZones } from './island-shape';

export const SIDEWALK_WIDTH = 2.5;

const nodeSchema = z.object({
  id: z.number().int().nonnegative(),
  x: z.number(),
  z: z.number(),
});

const edgeSchema = z.object({
  id: z.number().int().nonnegative(),
  a: z.number().int().nonnegative(),
  b: z.number().int().nonnegative(),
  lanes: z.number().int().positive(),
  width: z.number().positive(),
  speed: z.number().positive(),
  oneWay: z.boolean(),
  kind: z.enum(['coast', 'avenue', 'street']),
  length: z.number().positive(),
});

const graphSchema = z.object({
  nodes: z.array(nodeSchema).min(4),
  edges: z.array(edgeSchema).min(4),
});

export type RoadNode = z.infer<typeof nodeSchema>;
export type RoadEdge = z.infer<typeof edgeSchema>;
export type RoadGraph = z.infer<typeof graphSchema>;

interface GridSpec {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  step: number;
  coast: 'west' | 'east' | 'none';
  avenueEvery: number;
}

export function buildRoadGraph(): RoadGraph {
  const rng = mulberry32(0xc05a);
  const nodes: RoadNode[] = [];
  const edges: Array<Omit<RoadEdge, 'length'> & { length?: number }> = [];
  const index = new Map<string, number>();

  const addNode = (x: number, z: number): number => {
    const key = `${Math.round(x * 10)}:${Math.round(z * 10)}`;
    const found = index.get(key);
    if (found !== undefined) return found;
    const id = nodes.length;
    nodes.push({ id, x, z });
    index.set(key, id);
    return id;
  };

  const addEdge = (
    a: number,
    b: number,
    kind: RoadEdge['kind'],
    width: number,
    lanes: number,
    speed: number,
    oneWay: boolean,
  ) => {
    const na = nodes[a];
    const nb = nodes[b];
    if (!na || !nb || a === b) return;
    const length = Math.hypot(nb.x - na.x, nb.z - na.z);
    if (length < 12) return;
    edges.push({ id: edges.length, a, b, lanes, width, speed, oneWay, kind, length });
  };

  const closest = (x: number, z: number, max: number): number => {
    let best = -1;
    let bestD = max;
    for (const node of nodes) {
      const distance = Math.hypot(node.x - x, node.z - z);
      if (distance < bestD) {
        bestD = distance;
        best = node.id;
      }
    }
    return best;
  };

  const layGrid = (spec: GridSpec) => {
    const xs: number[] = [];
    const zs: number[] = [];
    for (let x = spec.x0; x <= spec.x1 + 0.1; x += spec.step) xs.push(x);
    for (let z = spec.z0; z <= spec.z1 + 0.1; z += spec.step) zs.push(z);
    if (spec.x0 < -2 && spec.x1 > 2 && !xs.some((value) => Math.abs(value) < 3)) xs.push(0);
    xs.sort((a, b) => a - b);
    zs.sort((a, b) => a - b);
    const ids: number[][] = [];
    for (let ix = 0; ix < xs.length; ix += 1) {
      const column: number[] = [];
      for (let iz = 0; iz < zs.length; iz += 1) {
        const border = ix === 0 || iz === 0 || ix === xs.length - 1 || iz === zs.length - 1;
        const coastColumn =
          (spec.coast === 'west' && ix === 0) || (spec.coast === 'east' && ix === xs.length - 1);
        let x = xs[ix] ?? 0;
        let z = zs[iz] ?? 0;
        const spine = Math.abs(x) < 1;
        if (spine) x = 0;
        if (!border && !coastColumn && !spine) {
          x += (rng() - 0.5) * 12;
          z += (rng() - 0.5) * 10;
        }
        if (!onIsland(x, z)) {
          column.push(-1);
          continue;
        }
        column.push(addNode(x, z));
      }
      ids.push(column);
    }
    for (let ix = 0; ix < xs.length; ix += 1) {
      for (let iz = 0; iz < zs.length; iz += 1) {
        const id = ids[ix]?.[iz] ?? -1;
        if (id < 0) continue;
        const east = ids[ix + 1]?.[iz] ?? -1;
        const north = ids[ix]?.[iz + 1] ?? -1;
        const coastColumn =
          (spec.coast === 'west' && ix === 0) || (spec.coast === 'east' && ix === xs.length - 1);
        if (north >= 0) {
          const kind = coastColumn ? 'coast' : ix % spec.avenueEvery === 1 ? 'avenue' : 'street';
          addEdge(
            id,
            north,
            kind,
            kind === 'coast' ? 16 : kind === 'avenue' ? 12 : 7.5,
            kind === 'coast' ? 4 : 2,
            kind === 'coast' ? 14 : kind === 'avenue' ? 12 : 8,
            kind === 'street' && ix % 4 === 2,
          );
        }
        if (east >= 0) {
          const avenue = iz % spec.avenueEvery === 1;
          const kind = avenue ? 'avenue' : 'street';
          addEdge(id, east, kind, avenue ? 12 : 7.5, 2, avenue ? 12 : 8, !avenue && iz % 5 === 3);
        }
      }
    }
  };

  const centro = urbanZones[0];
  const jurere = urbanZones[1];
  const norte = urbanZones[2];
  const leste = urbanZones[3];
  const sul = urbanZones[4];
  if (!centro || !jurere || !norte || !leste || !sul) return graphSchema.parse({ nodes, edges });

  layGrid({
    x0: centro.x - centro.sx / 2 + 18,
    x1: centro.x + centro.sx / 2 - 8,
    z0: centro.z - centro.sz / 2 + 12,
    z1: centro.z + centro.sz / 2 - 12,
    step: 54,
    coast: 'west',
    avenueEvery: 2,
  });
  layGrid({
    x0: jurere.x - 50,
    x1: jurere.x + 50,
    z0: jurere.z - 40,
    z1: jurere.z + 40,
    step: 46,
    coast: 'none',
    avenueEvery: 3,
  });
  layGrid({
    x0: norte.x - 70,
    x1: norte.x + 70,
    z0: norte.z - 40,
    z1: norte.z + 40,
    step: 48,
    coast: 'none',
    avenueEvery: 3,
  });
  layGrid({
    x0: leste.x - 40,
    x1: leste.x + 40,
    z0: leste.z - 90,
    z1: leste.z + 90,
    step: 50,
    coast: 'east',
    avenueEvery: 3,
  });
  layGrid({
    x0: sul.x - 40,
    x1: sul.x + 40,
    z0: sul.z - 40,
    z1: sul.z + 40,
    step: 46,
    coast: 'none',
    avenueEvery: 3,
  });

  const link = (points: Array<readonly [number, number]>, kind: RoadEdge['kind']) => {
    let prev = -1;
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (!point || !onIsland(point[0], point[1])) {
        prev = -1;
        continue;
      }
      const snap = i === 0 || i === points.length - 1 ? closest(point[0], point[1], 48) : -1;
      const id = snap >= 0 ? snap : addNode(point[0], point[1]);
      if (prev >= 0) {
        addEdge(prev, id, kind, kind === 'avenue' ? 11 : 8, 2, kind === 'avenue' ? 13 : 9, false);
      }
      prev = id;
    }
  };

  link(
    [
      [-96, 120],
      [-120, 220],
      [-160, 340],
      [-190, 460],
      [-170, 520],
    ],
    'avenue',
  );
  link(
    [
      [-170, 600],
      [-80, 650],
      [40, 680],
      [100, 700],
    ],
    'avenue',
  );
  link(
    [
      [60, -40],
      [120, -90],
      [180, -150],
      [210, -200],
    ],
    'avenue',
  );
  link(
    [
      [-40, -140],
      [-10, -280],
      [10, -420],
      [20, -520],
    ],
    'avenue',
  );
  link(
    [
      [180, 660],
      [150, 520],
      [70, 400],
      [30, 280],
      [10, 170],
      [20, 80],
    ],
    'street',
  );

  const parsed = edges.map((edge, id) => ({ ...edge, id, length: edge.length ?? 1 }));
  return graphSchema.parse({ nodes, edges: parsed });
}

export function edgeAngle(graph: RoadGraph, edge: RoadEdge): number {
  const a = graph.nodes[edge.a];
  const b = graph.nodes[edge.b];
  if (!a || !b) return 0;
  return Math.atan2(b.x - a.x, b.z - a.z);
}
