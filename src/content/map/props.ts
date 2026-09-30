/** Street furniture along the sidewalk. Parked cars stay on the curb, off the lane. */

import { chunkIndex, type BoxCollider, type CityBatcher } from './batch';
import { plazas, plazaGrassArea, type Footprint } from './blocks';
import type { ShopDoor } from './facades';
import { onIsland, sampleHeight, urbanWeight } from './island-shape';
import { mulberry32 } from './rng';
import { SIDEWALK_WIDTH, type RoadGraph } from './roads';

export interface Poi {
  x: number;
  z: number;
  kind: 'shop' | 'stop' | 'plaza' | 'stall';
}

export interface PropResult {
  pois: Poi[];
  colliders: BoxCollider[];
  trees: number;
  grass: number;
}

const carColors = [0xc4553a, 0xf4f1ea, 0x2a2a2a, 0xd5dde4, 0xf2c14e, 0x1f4e79];

export function buildProps(
  graph: RoadGraph,
  doors: ShopDoor[],
  footprints: Footprint[],
  batch: CityBatcher,
): PropResult {
  const rng = mulberry32(0x5a1e);
  const pois: Poi[] = [];
  const colliders: BoxCollider[] = [];
  let trees = 0;
  for (const door of doors) {
    if (door.x * door.x + (door.z - 8) * (door.z - 8) < 16 * 16) continue;
    pois.push({ x: door.x, z: door.z, kind: 'shop' });
  }
  for (const plaza of plazas) {
    const y = sampleHeight(plaza.x, plaza.z);
    const chunk = chunkIndex(plaza.x, plaza.z);
    batch.add(
      flat('sidewalk', plaza.sx, 0.05, plaza.sz, plaza.x, y + 0.04, plaza.z, 0, 0xffffff, chunk),
    );
    batch.add(
      flat(
        'grass',
        plaza.sx * 0.62,
        0.06,
        plaza.sz * 0.62,
        plaza.x,
        y + 0.08,
        plaza.z,
        0,
        0xffffff,
        chunk,
      ),
    );
    pois.push({ x: plaza.x, z: plaza.z, kind: 'plaza' });
  }
  for (const edge of graph.edges) {
    const a = graph.nodes[edge.a];
    const b = graph.nodes[edge.b];
    if (!a || !b) continue;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const inset = 10;
    for (let distance = inset; distance < edge.length - inset; distance += 12) {
      for (const side of [-1, 1] as const) {
        const walk = edge.width / 2 + 0.32 + SIDEWALK_WIDTH * 0.55;
        const x = a.x + fx * distance + rx * side * walk;
        const z = a.z + fz * distance + rz * side * walk;
        if (!onIsland(x, z) || urbanWeight(x, z) < 0.96) continue;
        const y = sampleHeight(x, z);
        if (y < 1) continue;
        const chunk = chunkIndex(x, z);
        if (Math.round(distance) % 24 === 0) {
          addLamp(batch, x, y, z, chunk);
        } else {
          addTree(batch, x, y, z, chunk, rng);
          trees += 1;
        }
        if (edge.kind !== 'coast' && rng() > 0.62 && distance % 24 !== 0) {
          const curb = edge.width / 2 + 0.7;
          const cx = a.x + fx * distance + rx * side * curb;
          const cz = a.z + fz * distance + rz * side * curb;
          if (Math.abs(cx) < 8 && cz > -6 && cz < 22) continue;
          addParked(batch, colliders, cx, sampleHeight(cx, cz), cz, yaw, chunk, rng);
        }
        if (edge.kind !== 'street' && rng() > 0.82) {
          addBench(batch, x, y, z, yaw, chunk);
        }
        if (rng() > 0.9) addBin(batch, x + rx * 0.4, y, z + rz * 0.4, chunk);
      }
    }
    if (edge.kind !== 'street' && edge.length > 40) {
      const mid = edge.length * 0.5;
      const x = a.x + fx * mid + rx * (edge.width / 2 + 2.2);
      const z = a.z + fz * mid + rz * (edge.width / 2 + 2.2);
      if (onIsland(x, z)) {
        const y = sampleHeight(x, z);
        const chunk = chunkIndex(x, z);
        batch.add(flat('concrete', 3.2, 2.4, 1.4, x, y + 1.2, z, yaw, 0xe7e1d6, chunk));
        batch.add(flat('flat', 3.4, 0.12, 1.8, x, y + 2.5, z, yaw, 0xc4553a, chunk));
        pois.push({ x, z, kind: 'stop' });
      }
    }
  }
  let stalls = 0;
  for (const lot of footprints) {
    if (lot.kind !== 'shop' || stalls >= 8 || lot.seed % 7 !== 0) continue;
    const fx = Math.sin(lot.yaw);
    const fz = Math.cos(lot.yaw);
    const x = lot.x + fx * (lot.sz / 2 + 2.2);
    const z = lot.z + fz * (lot.sz / 2 + 2.2);
    if (Math.abs(x) < 8 && z > -4 && z < 20) continue;
    const y = sampleHeight(x, z);
    batch.add(flat('flat', 1.8, 1.6, 1.2, x, y + 0.8, z, lot.yaw, 0xf2c14e, lot.chunk));
    pois.push({ x, z, kind: 'stall' });
    stalls += 1;
  }
  for (const node of graph.nodes) {
    let degree = 0;
    let avenue = false;
    for (const edge of graph.edges) {
      if (edge.a !== node.id && edge.b !== node.id) continue;
      degree += 1;
      if (edge.kind !== 'street') avenue = true;
    }
    if (degree < 3 || !avenue) continue;
    const y = sampleHeight(node.x, node.z);
    if (y < 1) continue;
    const chunk = chunkIndex(node.x, node.z);
    batch.add(flat('flat', 0.16, 4.2, 0.16, node.x + 3, y + 2.1, node.z + 3, 0, 0x222222, chunk));
    batch.add({
      kind: 'box',
      finish: 'flat',
      sx: 0.35,
      sy: 0.7,
      sz: 0.2,
      x: node.x + 3,
      y: y + 4.3,
      z: node.z + 3,
      yaw: 0,
      pitch: 0,
      color: 0x3a7d32,
      roughness: 0.4,
      metalness: 0.1,
      emissive: 0x3a7d32,
      castShadow: false,
      chunk,
      lod: 'always',
    });
  }
  return { pois, colliders, trees, grass: plazaGrassArea() };
}

function addTree(
  batch: CityBatcher,
  x: number,
  y: number,
  z: number,
  chunk: number,
  rng: () => number,
): void {
  const height = 3.4 + rng() * 1.4;
  batch.add({
    kind: 'cylinder',
    finish: 'flat',
    sx: 0.28,
    sy: height,
    sz: 0.28,
    x,
    y: y + height / 2,
    z,
    yaw: 0,
    pitch: 0,
    color: 0x6b4a2f,
    roughness: 0.9,
    metalness: 0,
    emissive: 0,
    castShadow: false,
    chunk,
    lod: 'always',
  });
  batch.add({
    kind: 'cylinder',
    finish: 'flat',
    sx: 6.6,
    sy: 2.2,
    sz: 6.6,
    x,
    y: y + height + 0.4,
    z,
    yaw: 0,
    pitch: 0,
    color: rng() > 0.5 ? 0x1f7a34 : 0x176b32,
    roughness: 0.85,
    metalness: 0,
    emissive: 0,
    castShadow: false,
    chunk,
    lod: 'always',
  });
}

function addLamp(batch: CityBatcher, x: number, y: number, z: number, chunk: number): void {
  batch.add(flat('flat', 0.14, 4.6, 0.14, x, y + 2.3, z, 0, 0x2a2a2a, chunk));
  batch.add({
    kind: 'box',
    finish: 'flat',
    sx: 0.45,
    sy: 0.16,
    sz: 0.22,
    x,
    y: y + 4.7,
    z,
    yaw: 0,
    pitch: 0,
    color: 0xfff1c9,
    roughness: 0.3,
    metalness: 0,
    emissive: 0xffe2a2,
    castShadow: false,
    chunk,
    lod: 'always',
  });
}

function addParked(
  batch: CityBatcher,
  colliders: BoxCollider[],
  x: number,
  y: number,
  z: number,
  yaw: number,
  chunk: number,
  rng: () => number,
): void {
  const color = carColors[Math.floor(rng() * carColors.length)] ?? 0xf4f1ea;
  const scale = 0.85 + rng() * 0.2;
  batch.add(flat('flat', 1.7 * scale, 1.15, 4.1 * scale, x, y + 0.7, z, yaw, color, chunk));
  batch.add(flat('flat', 1.45 * scale, 0.7, 2.1 * scale, x, y + 1.45, z, yaw, 0xd5e3ea, chunk));
  colliders.push({
    x,
    y: y + 0.7,
    z,
    hx: 0.85 * scale,
    hy: 0.7,
    hz: 2.05 * scale,
    yaw,
    pitch: 0,
    chunk,
  });
}

function addBench(
  batch: CityBatcher,
  x: number,
  y: number,
  z: number,
  yaw: number,
  chunk: number,
): void {
  batch.add(flat('flat', 1.5, 0.45, 0.45, x, y + 0.4, z, yaw, 0x8a5a32, chunk));
}

function addBin(batch: CityBatcher, x: number, y: number, z: number, chunk: number): void {
  batch.add(flat('flat', 0.45, 0.8, 0.45, x, y + 0.4, z, 0, 0x2f6b45, chunk));
}

function flat(
  finish: 'flat' | 'grass' | 'sidewalk' | 'concrete',
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  color: number,
  chunk: number,
) {
  return {
    kind: 'box' as const,
    finish,
    sx,
    sy,
    sz,
    x,
    y,
    z,
    yaw,
    pitch: 0,
    color,
    roughness: finish === 'flat' ? 0.7 : 0.9,
    metalness: 0,
    emissive: 0,
    castShadow: false,
    chunk,
    lod: 'always' as const,
  };
}
