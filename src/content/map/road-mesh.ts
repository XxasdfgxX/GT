/** Asphalt, curbs, sidewalks, and crosswalks extruded along the road graph. */

import { chunkIndex, type BoxCollider, type CityBatcher } from './batch';
import { sampleHeight } from './island-shape';
import { SIDEWALK_WIDTH, type RoadEdge, type RoadGraph, type RoadNode } from './roads';

/** Meters the drawn street sits above the heightfield. Tires and feet use this. */
export const STREET_LIFT = 0.12;

export interface WalkQuad {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  cx: number;
  cz: number;
  dx: number;
  dz: number;
  y: number;
  crosswalk: boolean;
}

const segment = 16;

export function buildRoadMeshes(
  graph: RoadGraph,
  batch: CityBatcher,
  colliders: BoxCollider[],
): WalkQuad[] {
  const walks: WalkQuad[] = [];
  for (const edge of graph.edges) {
    layEdge(graph, edge, batch, colliders, walks);
  }
  for (const node of graph.nodes) layJunction(graph, node, batch);
  return walks;
}

function nodeReach(graph: RoadGraph, id: number): number {
  let width = 8;
  for (const edge of graph.edges) {
    if (edge.a === id || edge.b === id) width = Math.max(width, edge.width);
  }
  return width / 2 + 3;
}

function layEdge(
  graph: RoadGraph,
  edge: RoadEdge,
  batch: CityBatcher,
  colliders: BoxCollider[],
  walks: WalkQuad[],
): void {
  const a = graph.nodes[edge.a];
  const b = graph.nodes[edge.b];
  if (!a || !b) return;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = edge.length;
  const yaw = Math.atan2(dx, dz);
  const fx = dx / length;
  const fz = dz / length;
  const rx = fz;
  const rz = -fx;
  const trimA = Math.min(nodeReach(graph, edge.a), length * 0.35);
  const trimB = Math.min(nodeReach(graph, edge.b), length * 0.35);
  const usable = length - trimA - trimB;
  if (usable < 6) return;
  const steps = Math.max(1, Math.ceil(usable / segment));
  for (let step = 0; step < steps; step += 1) {
    const s0 = trimA + (usable * step) / steps;
    const s1 = trimA + (usable * (step + 1)) / steps;
    const piece = s1 - s0;
    const x0 = a.x + fx * s0;
    const z0 = a.z + fz * s0;
    const x1 = a.x + fx * s1;
    const z1 = a.z + fz * s1;
    const h0 = sampleHeight(x0, z0);
    const h1 = sampleHeight(x1, z1);
    if (h0 < 0.2 || h1 < 0.2) continue;
    const pitch = Math.atan2(h1 - h0, piece);
    const y = (h0 + h1) / 2;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const chunk = chunkIndex(mx, mz);
    stampBox(batch, {
      finish: 'asphalt',
      sx: edge.width,
      sy: 0.08,
      sz: piece,
      x: mx,
      y: y + 0.05,
      z: mz,
      yaw,
      pitch,
      color: 0xffffff,
      chunk,
    });
    layLanes(batch, edge, mx, mz, y, yaw, pitch, piece, chunk);
    for (const side of [-1, 1] as const) {
      const ox = rx * side;
      const oz = rz * side;
      const curb = edge.width / 2 + 0.16;
      const walk = edge.width / 2 + 0.32 + SIDEWALK_WIDTH / 2;
      const cx = mx + ox * curb;
      const cz = mz + oz * curb;
      if (sampleHeight(cx, cz) < 0.2) continue;
      stampBox(batch, {
        finish: 'concrete',
        sx: 0.28,
        sy: 0.18,
        sz: piece,
        x: cx,
        y: y + 0.12,
        z: cz,
        yaw,
        pitch,
        color: 0xffffff,
        chunk,
      });
      colliders.push({
        x: cx,
        y: y + 0.12,
        z: cz,
        hx: 0.14,
        hy: 0.09,
        hz: piece / 2,
        yaw,
        pitch,
        chunk,
      });
      const wx = mx + ox * walk;
      const wz = mz + oz * walk;
      if (sampleHeight(wx, wz) < 0.2) continue;
      stampBox(batch, {
        finish: 'sidewalk',
        sx: SIDEWALK_WIDTH,
        sy: 0.06,
        sz: piece,
        x: wx,
        y: y + 0.08,
        z: wz,
        yaw,
        pitch,
        color: 0xffffff,
        chunk,
      });
      const halfW = SIDEWALK_WIDTH / 2;
      const halfL = piece / 2;
      walks.push(quad(wx, wz, y + 0.1, rx, rz, fx, fz, halfW, halfL, false));
    }
  }
  layCrosswalk(graph, edge, a, fx, fz, rx, rz, yaw, trimA, true, batch, walks);
  layCrosswalk(graph, edge, a, fx, fz, rx, rz, yaw, length - trimB, false, batch, walks);
}

function layLanes(
  batch: CityBatcher,
  edge: RoadEdge,
  x: number,
  z: number,
  y: number,
  yaw: number,
  pitch: number,
  piece: number,
  chunk: number,
): void {
  const dashes = Math.max(1, Math.floor(piece / 6));
  for (let i = 0; i < dashes; i += 1) {
    const along = -piece / 2 + (i + 0.5) * (piece / dashes);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    stampBox(batch, {
      finish: 'lane',
      sx: 0.12,
      sy: 0.02,
      sz: Math.min(2.2, piece / dashes - 1.2),
      x: x + fx * along,
      y: y + 0.1,
      z: z + fz * along,
      yaw,
      pitch,
      color: 0xffffff,
      chunk,
    });
  }
  if (edge.lanes < 4) return;
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  for (const side of [-1, 1]) {
    stampBox(batch, {
      finish: 'lane',
      sx: 0.1,
      sy: 0.02,
      sz: piece * 0.92,
      x: x + rx * side * (edge.width / 4),
      y: y + 0.1,
      z: z + rz * side * (edge.width / 4),
      yaw,
      pitch,
      color: 0xffffff,
      chunk,
    });
  }
}

function layCrosswalk(
  graph: RoadGraph,
  edge: RoadEdge,
  a: RoadNode,
  fx: number,
  fz: number,
  rx: number,
  rz: number,
  yaw: number,
  distance: number,
  fromStart: boolean,
  batch: CityBatcher,
  walks: WalkQuad[],
): void {
  const x = a.x + fx * distance;
  const z = a.z + fz * distance;
  const y = sampleHeight(x, z);
  if (y < 0.2) return;
  const chunk = chunkIndex(x, z);
  const stripes = 6;
  for (let i = 0; i < stripes; i += 1) {
    const across = -edge.width * 0.38 + (i * edge.width * 0.76) / stripes;
    stampBox(batch, {
      finish: 'lane',
      sx: 0.45,
      sy: 0.02,
      sz: 1.6,
      x: x + rx * across + fx * (fromStart ? 1.2 : -1.2),
      y: y + 0.11,
      z: z + rz * across + fz * (fromStart ? 1.2 : -1.2),
      yaw,
      pitch: 0,
      color: 0xffffff,
      chunk,
    });
  }
  const half = edge.width / 2 + 0.3;
  walks.push(
    quad(
      x + fx * (fromStart ? 1.2 : -1.2),
      z + fz * (fromStart ? 1.2 : -1.2),
      y + 0.12,
      rx,
      rz,
      fx,
      fz,
      half,
      1.3,
      true,
    ),
  );
  void graph;
}

function layJunction(graph: RoadGraph, node: RoadNode, batch: CityBatcher): void {
  let degree = 0;
  let width = 8;
  for (const edge of graph.edges) {
    if (edge.a !== node.id && edge.b !== node.id) continue;
    degree += 1;
    width = Math.max(width, edge.width);
  }
  if (degree < 2) return;
  const y = sampleHeight(node.x, node.z);
  if (y < 0.2) return;
  const size = width + 6;
  stampBox(batch, {
    finish: 'asphalt',
    sx: size,
    sy: 0.08,
    sz: size,
    x: node.x,
    y: y + 0.07,
    z: node.z,
    yaw: 0,
    pitch: 0,
    color: 0xffffff,
    chunk: chunkIndex(node.x, node.z),
  });
}

function quad(
  x: number,
  z: number,
  y: number,
  rx: number,
  rz: number,
  fx: number,
  fz: number,
  halfAcross: number,
  halfAlong: number,
  crosswalk: boolean,
): WalkQuad {
  return {
    ax: x - rx * halfAcross - fx * halfAlong,
    az: z - rz * halfAcross - fz * halfAlong,
    bx: x + rx * halfAcross - fx * halfAlong,
    bz: z + rz * halfAcross - fz * halfAlong,
    cx: x + rx * halfAcross + fx * halfAlong,
    cz: z + rz * halfAcross + fz * halfAlong,
    dx: x - rx * halfAcross + fx * halfAlong,
    dz: z - rz * halfAcross + fz * halfAlong,
    y,
    crosswalk,
  };
}

function stampBox(
  batch: CityBatcher,
  stamp: {
    finish: 'asphalt' | 'concrete' | 'sidewalk' | 'lane';
    sx: number;
    sy: number;
    sz: number;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    color: number;
    chunk: number;
  },
): void {
  if (stamp.sz < 0.2 || stamp.sx < 0.05) return;
  batch.add({
    kind: 'box',
    roughness: 0.9,
    metalness: 0,
    emissive: 0,
    castShadow: false,
    lod: 'always',
    ...stamp,
  });
}
