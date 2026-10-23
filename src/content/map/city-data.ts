/** Assembles the island: terrain, roads, lots, and props. Pure data, no Three.js. */

import { CityBatcher, type BoxCollider, type CityMesh } from './batch';
import { buildFootprints, type Footprint } from './blocks';
import { buildFacades } from './facades';
import {
  islandBounds,
  islandOutline,
  lagoonOutline,
  sampleHeight,
  terrainColor,
  terrainSplat,
  urbanZones,
} from './island-shape';
import { buildProps, type Poi } from './props';
import type { ParkedSpot } from '../spawns';
import { buildRoadMeshes, type WalkQuad } from './road-mesh';
import { buildRoadGraph, type RoadGraph } from './roads';

export interface TerrainField {
  originX: number;
  originZ: number;
  sizeX: number;
  sizeZ: number;
  rows: number;
  cols: number;
  /** Row-major: index = iz * cols + ix. */
  heights: Float32Array;
  colors: Float32Array;
  /** Four weights per vertex: sand, paved, rock, grass. */
  splat: Float32Array;
}

export interface CostaVerde {
  terrain: TerrainField;
  /** Column-major heights for the physics heightfield. Same grid as terrain. */
  physicsHeights: Float32Array;
  water: { x: number; y: number; z: number; sx: number; sz: number };
  meshes: CityMesh[];
  colliders: BoxCollider[];
  /** Street furniture: physics bodies only, so walkers keep their sidewalk paths. */
  streetProps: BoxCollider[];
  /** Curbside spots for the real parked cars. */
  parkedSpots: ParkedSpot[];
  graph: RoadGraph;
  walks: WalkQuad[];
  footprints: Footprint[];
  pois: Poi[];
  /** Plaza grass plus tree canopy, divided by the urban basins. */
  urbanGreen: number;
  outline: ReadonlyArray<readonly [number, number]>;
  lagoon: ReadonlyArray<readonly [number, number]>;
}

const cell = 16;

export function createCity(): CostaVerde {
  const graph = buildRoadGraph();
  const batch = new CityBatcher();
  const colliders: BoxCollider[] = [];
  const walks = buildRoadMeshes(graph, batch, colliders);
  const lots = buildFootprints(graph);
  const doors = buildFacades(lots.footprints, batch);
  const props = buildProps(graph, doors, lots.footprints, batch);
  colliders.push(...lots.colliders);
  addSeawall(batch, colliders);
  const terrain = buildTerrain();
  const urbanArea = urbanZones.reduce((sum, zone) => sum + zone.sx * zone.sz, 0);
  const crown = 3.3;
  const canopy = props.trees * Math.PI * crown * crown;
  const bounds = islandBounds();
  return {
    terrain,
    physicsHeights: columnMajor(terrain),
    water: {
      x: (bounds.minX + bounds.maxX) / 2,
      y: -0.45,
      z: (bounds.minZ + bounds.maxZ) / 2,
      sx: terrain.sizeX + 1400,
      sz: terrain.sizeZ + 1400,
    },
    meshes: batch.build(),
    colliders,
    streetProps: props.solids,
    parkedSpots: props.parked,
    graph,
    walks,
    footprints: lots.footprints,
    pois: props.pois,
    urbanGreen: (props.grass + canopy) / urbanArea,
    outline: islandOutline,
    lagoon: lagoonOutline,
  };
}

let cached: CostaVerde | undefined;

export function buildCostaVerde(): CostaVerde {
  cached ??= createCity();
  return cached;
}

function buildTerrain(): TerrainField {
  const bounds = islandBounds();
  const pad = 40;
  const originX = bounds.minX - pad;
  const originZ = bounds.minZ - pad;
  const sizeX = bounds.maxX - bounds.minX + pad * 2;
  const sizeZ = bounds.maxZ - bounds.minZ + pad * 2;
  const cols = Math.ceil(sizeX / cell) + 1;
  const rows = Math.ceil(sizeZ / cell) + 1;
  const heights = new Float32Array(rows * cols);
  const colors = new Float32Array(rows * cols * 3);
  const splat = new Float32Array(rows * cols * 4);
  for (let iz = 0; iz < rows; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const x = originX + (ix / (cols - 1)) * sizeX;
      const z = originZ + (iz / (rows - 1)) * sizeZ;
      const height = sampleHeight(x, z);
      const index = iz * cols + ix;
      heights[index] = height;
      const color = terrainColor(x, z, height);
      colors[index * 3] = ((color >> 16) & 255) / 255;
      colors[index * 3 + 1] = ((color >> 8) & 255) / 255;
      colors[index * 3 + 2] = (color & 255) / 255;
      terrainSplat(x, z, height, splat, index * 4);
    }
  }
  return { originX, originZ, sizeX, sizeZ, rows, cols, heights, colors, splat };
}

function columnMajor(terrain: TerrainField): Float32Array {
  const { rows, cols, heights } = terrain;
  const out = new Float32Array(rows * cols);
  for (let iz = 0; iz < rows; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      out[ix * rows + iz] = heights[iz * cols + ix] ?? 0;
    }
  }
  return out;
}

function addSeawall(batch: CityBatcher, colliders: BoxCollider[]): void {
  const ring = islandOutline;
  const area = signedArea(ring);
  const outward = area > 0 ? 1 : -1;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 1) continue;
    const rx = (dz / length) * outward;
    const rz = (-dx / length) * outward;
    const x = (a[0] + b[0]) / 2 + rx * 4;
    const z = (a[1] + b[1]) / 2 + rz * 4;
    const yaw = Math.atan2(dx, dz);
    batch.add({
      kind: 'box',
      finish: 'concrete',
      sx: 1.4,
      sy: 2.4,
      sz: length,
      x,
      y: 0.5,
      z,
      yaw,
      pitch: 0,
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0,
      emissive: 0,
      castShadow: false,
      chunk: -1,
      lod: 'always',
    });
    colliders.push({
      x,
      y: 0.9,
      z,
      hx: 0.7,
      hy: 1.2,
      hz: length / 2,
      yaw,
      pitch: 0,
      chunk: -1,
    });
  }
}

function signedArea(ring: ReadonlyArray<readonly [number, number]>): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum;
}
