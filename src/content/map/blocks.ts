/** Lots pressed against the sidewalk, sharing party walls along each street. */

import { chunkIndex, type BoxCollider } from './batch';
import {
  CITY_FLOOR,
  onIsland,
  sampleHeight,
  urbanWeight,
  zoneAt,
  type UrbanZone,
} from './island-shape';
import { mulberry32 } from './rng';
import { SIDEWALK_WIDTH, type RoadEdge, type RoadGraph } from './roads';

export interface Footprint {
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sz: number;
  sy: number;
  floors: number;
  setback: number;
  kind: 'shop' | 'residential' | 'tower' | 'house';
  color: number;
  seed: number;
  chunk: number;
}

export interface Plaza {
  x: number;
  z: number;
  sx: number;
  sz: number;
}

export const plazas: readonly Plaza[] = [
  { x: -48, z: 42, sx: 40, sz: 32 },
  { x: -128, z: -62, sx: 34, sz: 28 },
];

const shopColors = [0xe07a5f, 0xf2cc8f, 0xf4f1ea, 0xc4553a, 0xe9c46a];
const homeColors = [0xf7f4ef, 0xd5dde4, 0xe7d7c3, 0xc9d4dc, 0xf3efe6];
const towerColors = [0xf4f7f8, 0xd5dde4, 0xe7dcc8, 0xc5d0d6];

const floorHeight = 3.15;

export function buildFootprints(graph: RoadGraph): {
  footprints: Footprint[];
  colliders: BoxCollider[];
} {
  const rng = mulberry32(0xb10c);
  const footprints: Footprint[] = [];
  const colliders: BoxCollider[] = [];
  const streets = streetBands(graph);
  const taken: Rect[] = [];
  for (const edge of graph.edges) {
    const a = graph.nodes[edge.a];
    const b = graph.nodes[edge.b];
    if (!a || !b) continue;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const inset = Math.min(14, edge.length * 0.22);
    let cursor = inset;
    while (cursor < edge.length - inset - 6) {
      const lot = Math.min(7.5 + rng() * 6.5, edge.length - inset - cursor);
      if (lot < 6.5) break;
      const along = cursor + lot / 2;
      cursor += lot;
      for (const side of [-1, 1] as const) {
        const setback = rng() * 0.85;
        const kind = pickKind(edge, along, a, fx, fz, rx, rz, side, rng);
        const full = kind === 'tower' ? 14 : kind === 'house' ? 8 : 12;
        const face = Math.atan2(-rx * side, -rz * side);
        // Corner lots from two streets reach into each other and into the cross street.
        // A crowded lot tries a shallow depth before it gives the corner up.
        let rect: Rect | null = null;
        for (const depth of full > SHALLOW_LOT ? [full, SHALLOW_LOT] : [full]) {
          const offset = edge.width / 2 + SIDEWALK_WIDTH + setback + depth / 2;
          const x = a.x + fx * along + rx * side * offset;
          const z = a.z + fz * along + rz * side * offset;
          if (!acceptLot(x, z, lot, depth)) continue;
          const candidate = { x, z, hx: lot / 2, hz: depth / 2, yaw: face };
          if (crowded(candidate, taken, streets)) continue;
          rect = candidate;
          break;
        }
        if (!rect) continue;
        taken.push(rect);
        const { x, z } = rect;
        const depth = rect.hz * 2;
        const floors = pickFloors(kind, rng);
        const sy = floors * floorHeight;
        const ground = sampleHeight(x, z);
        const color = paint(kind, rng);
        const footprint: Footprint = {
          x,
          y: ground,
          z,
          yaw: face,
          sx: lot,
          sz: depth,
          sy,
          floors,
          setback,
          kind,
          color,
          seed: Math.floor(rng() * 1000),
          chunk: chunkIndex(x, z),
        };
        footprints.push(footprint);
        colliders.push({
          x,
          y: ground + sy / 2,
          z,
          hx: lot / 2,
          hy: sy / 2,
          hz: depth / 2,
          yaw: face,
          pitch: 0,
          chunk: footprint.chunk,
        });
      }
    }
  }
  return { footprints, colliders };
}

function acceptLot(x: number, z: number, lot: number, depth: number): boolean {
  if (!onIsland(x, z)) return false;
  if (urbanWeight(x, z) < 0.72) return false;
  const ground = sampleHeight(x, z);
  if (ground < CITY_FLOOR - 0.4 || ground > CITY_FLOOR + 1.2) return false;
  if (inPlaza(x, z)) return false;
  const reach = Math.hypot(lot, depth) / 2;
  if (Math.abs(x) < 7 + reach && z > -8 - reach && z < 24 + reach) return false;
  return true;
}

/** A yawed rectangle on the ground. Local +Z is (sin yaw, cos yaw), as for colliders. */
interface Rect {
  x: number;
  z: number;
  hx: number;
  hz: number;
  yaw: number;
}

/** Depth a corner lot falls back to when the full one runs into a neighbor. */
const SHALLOW_LOT = 6;

/** Shared walls touch exactly. The slack keeps them from counting as overlap. */
const WALL_SLACK = 0.1;

/** Each street with its sidewalks, as a rectangle node to node. */
function streetBands(graph: RoadGraph): Rect[] {
  const bands: Rect[] = [];
  for (const edge of graph.edges) {
    const a = graph.nodes[edge.a];
    const b = graph.nodes[edge.b];
    if (!a || !b) continue;
    bands.push({
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      hx: edge.width / 2 + SIDEWALK_WIDTH,
      hz: edge.length / 2,
      yaw: Math.atan2(b.x - a.x, b.z - a.z),
    });
  }
  return bands;
}

function crowded(rect: Rect, taken: readonly Rect[], streets: readonly Rect[]): boolean {
  for (const other of taken) if (rectsOverlap(rect, other)) return true;
  for (const street of streets) if (rectsOverlap(rect, street)) return true;
  return false;
}

/** Separating-axis test on the four edge normals. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const reach = a.hx + a.hz + b.hx + b.hz;
  if (dx * dx + dz * dz > reach * reach) return false;
  return (
    overlapsOn(a, b, dx, dz, Math.sin(a.yaw), Math.cos(a.yaw)) &&
    overlapsOn(a, b, dx, dz, Math.cos(a.yaw), -Math.sin(a.yaw)) &&
    overlapsOn(a, b, dx, dz, Math.sin(b.yaw), Math.cos(b.yaw)) &&
    overlapsOn(a, b, dx, dz, Math.cos(b.yaw), -Math.sin(b.yaw))
  );
}

function overlapsOn(a: Rect, b: Rect, dx: number, dz: number, ax: number, az: number): boolean {
  const gap = Math.abs(dx * ax + dz * az);
  return gap < radiusOn(a, ax, az) + radiusOn(b, ax, az) - WALL_SLACK;
}

function radiusOn(rect: Rect, ax: number, az: number): number {
  const sin = Math.sin(rect.yaw);
  const cos = Math.cos(rect.yaw);
  return rect.hx * Math.abs(cos * ax - sin * az) + rect.hz * Math.abs(sin * ax + cos * az);
}

function inPlaza(x: number, z: number): boolean {
  for (const plaza of plazas) {
    if (Math.abs(x - plaza.x) < plaza.sx / 2 && Math.abs(z - plaza.z) < plaza.sz / 2) return true;
  }
  return false;
}

function pickKind(
  edge: RoadEdge,
  along: number,
  a: { x: number; z: number },
  fx: number,
  fz: number,
  rx: number,
  rz: number,
  side: number,
  rng: () => number,
): Footprint['kind'] {
  const x = a.x + fx * along + rx * side * (edge.width / 2 + 4);
  const z = a.z + fz * along + rz * side * (edge.width / 2 + 4);
  const zone: UrbanZone | undefined = zoneAt(x, z);
  if (edge.kind === 'coast') return rng() < 0.45 ? 'tower' : 'residential';
  if (edge.kind === 'avenue') return rng() < 0.55 ? 'shop' : 'residential';
  if (zone?.density === 'beach') return rng() < 0.6 ? 'shop' : 'house';
  if (zone?.density === 'town') return rng() < 0.4 ? 'shop' : 'house';
  return rng() < 0.35 ? 'shop' : 'house';
}

function pickFloors(kind: Footprint['kind'], rng: () => number): number {
  if (kind === 'tower') return 10 + Math.floor(rng() * 6);
  if (kind === 'residential') return 4 + Math.floor(rng() * 5);
  if (kind === 'shop') return 2 + Math.floor(rng() * 2);
  return 2;
}

function paint(kind: Footprint['kind'], rng: () => number): number {
  const list = kind === 'tower' ? towerColors : kind === 'house' ? homeColors : shopColors;
  return list[Math.floor(rng() * list.length)] ?? 0xf4f1ea;
}

export function plazaGrassArea(): number {
  let area = 0;
  for (const plaza of plazas) area += plaza.sx * plaza.sz * 0.52;
  return area;
}
