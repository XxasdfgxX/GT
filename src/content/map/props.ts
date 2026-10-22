/** Street furniture along the sidewalk. Parked cars stay on the curb, off the lane. */

import { chunkIndex, type BoxCollider, type CityBatcher, type MeshLod, type Stamp } from './batch';
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

/** Street props from scripts/import-polyhaven-models.mjs. All are Poly Haven, CC0. */
export const PROPS = {
  lamp: '/assets/props/street-lamp.glb',
  trashCan: '/assets/props/trash-can.glb',
  bench: '/assets/props/bench.glb',
  hydrant: '/assets/props/hydrant.glb',
  utilityBox: '/assets/props/utility-box.glb',
  barrier: '/assets/props/barrier.glb',
  pottedPlant: '/assets/props/potted-plant.glb',
  shrub: '/assets/props/shrub.glb',
  planter: '/assets/props/planter.glb',
  crate: '/assets/props/crate.glb',
  fern: '/assets/props/fern.glb',
} as const;

/** Every prop url, for the loader to fetch before the first chunk streams in. */
export const PROP_MODELS: readonly string[] = Object.values(PROPS);

const carColors = [0xc4553a, 0xf4f1ea, 0x2a2a2a, 0xd5dde4, 0xf2c14e, 0x1f4e79];

export function buildProps(
  graph: RoadGraph,
  doors: ShopDoor[],
  footprints: Footprint[],
  batch: CityBatcher,
): PropResult {
  const rng = mulberry32(0x5a1e);
  // New props draw from their own stream, so the parked cars and trees keep their places.
  const garden = mulberry32(0x9a2d);
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
      flat('plaza', plaza.sx, 0.05, plaza.sz, plaza.x, y + 0.04, plaza.z, 0, 0xffffff, chunk),
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
    // Planters at the corners of the lawn, shrubs and ferns along its edge.
    const hx = plaza.sx * 0.31;
    const hz = plaza.sz * 0.31;
    for (const [cx, cz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      batch.add(
        prop(
          PROPS.planter,
          plaza.x + cx * (hx + 1.2),
          y + 0.06,
          plaza.z + cz * (hz + 1.2),
          0,
          1.6,
          chunk,
        ),
      );
    }
    for (let k = 0; k < 10; k += 1) {
      const along = (k + 0.5) / 10;
      const north = k % 2 === 0;
      const px = plaza.x - hx + along * hx * 2;
      const pz = plaza.z + (north ? hz - 0.6 : -hz + 0.6);
      const look = garden() > 0.5 ? PROPS.shrub : PROPS.fern;
      batch.add(
        prop(look, px, y + 0.1, pz, garden() * Math.PI * 2, look === PROPS.shrub ? 4 : 1.6, chunk),
      );
    }
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
    // Slots every 12 m on both sides. Lamps stand 24 m apart on one side; trees fill the rest.
    for (let distance = inset; distance < edge.length - inset; distance += 12) {
      const evenSlot = Math.round((distance - inset) / 12) % 2 === 0;
      for (const side of [-1, 1] as const) {
        const lampSlot = side === -1 && evenSlot;
        const walk = edge.width / 2 + 0.32 + SIDEWALK_WIDTH * 0.55;
        const x = a.x + fx * distance + rx * side * walk;
        const z = a.z + fz * distance + rz * side * walk;
        if (!onIsland(x, z) || urbanWeight(x, z) < 0.96) continue;
        const y = sampleHeight(x, z);
        if (y < 1) continue;
        const chunk = chunkIndex(x, z);
        if (lampSlot) {
          addLamp(batch, x, y, z, yaw, chunk);
        } else {
          addTree(batch, x, y, z, chunk, rng);
          trees += 1;
        }
        if (edge.kind !== 'coast' && rng() > 0.62 && !lampSlot) {
          const curb = edge.width / 2 + 0.7;
          const cx = a.x + fx * distance + rx * side * curb;
          const cz = a.z + fz * distance + rz * side * curb;
          if (Math.abs(cx) < 8 && cz > -6 && cz < 22) continue;
          addParked(batch, colliders, cx, sampleHeight(cx, cz), cz, yaw, chunk, rng);
        }
        if (edge.kind !== 'street' && rng() > 0.82) {
          addBench(batch, x, y, z, yaw, chunk);
        }
        if (rng() > 0.9) addBin(batch, x + rx * 0.4, y, z + rz * 0.4, yaw, chunk);
        // A hydrant every 84 m on the side without lamps.
        if (side === 1 && Math.round((distance - inset) / 12) % 7 === 3) {
          batch.add(prop(PROPS.hydrant, x - fx * 1.6, y, z - fz * 1.6, yaw, 1, chunk));
        }
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
    // Beverage crates stacked beside the stall.
    const rx = Math.cos(lot.yaw);
    const rz = -Math.sin(lot.yaw);
    for (let k = 0; k < 3; k += 1) {
      batch.add(
        prop(
          PROPS.crate,
          x + rx * 1.4,
          y + k * 0.35,
          z + rz * 1.4,
          lot.yaw + garden() * 0.4,
          1.3,
          lot.chunk,
        ),
      );
    }
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
    // The traffic-light controller cabinet on the corner.
    batch.add(prop(PROPS.utilityBox, node.x + 3.8, y, node.z + 3, Math.PI / 4, 1, chunk));
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
    castShadow: true,
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
    castShadow: true,
    chunk,
    lod: 'always',
  });
}

function addLamp(
  batch: CityBatcher,
  x: number,
  y: number,
  z: number,
  yaw: number,
  chunk: number,
): void {
  // The Poly Haven lamp is 3.9 m; avenues want about 4.6.
  batch.add(prop(PROPS.lamp, x, y, z, yaw, 1.2, chunk, 'always'));
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
  // The seating kit is 4.3 m of modules side by side; scaled, it reads as one long bench.
  batch.add(prop(PROPS.bench, x, y, z, yaw + Math.PI / 2, 0.6, chunk));
}

function addBin(
  batch: CityBatcher,
  x: number,
  y: number,
  z: number,
  yaw: number,
  chunk: number,
): void {
  batch.add(prop(PROPS.trashCan, x, y, z, yaw, 0.8, chunk));
}

function flat(
  finish: 'flat' | 'grass' | 'sidewalk' | 'concrete' | 'plaza',
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
    // Ground pads lie flat; posts, stalls and parked cars stand up.
    castShadow: finish === 'flat' || finish === 'concrete',
    chunk,
    lod: 'always' as const,
  };
}

function prop(
  model: string,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale: number,
  chunk: number,
  lod: MeshLod = 'near',
): Stamp {
  return {
    kind: 'model',
    model,
    finish: 'flat',
    sx: scale,
    sy: scale,
    sz: scale,
    x,
    y,
    z,
    yaw,
    pitch: 0,
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    emissive: 0,
    castShadow: true,
    chunk,
    lod,
  };
}
