/** Costa Verde: a fictional Brazilian island city around the original street. */

import { writeYawMatrix } from '../engine/core/math';
import { island, streetPaint } from './map';
import type { MapContent } from './schemas';

type House = MapContent['buildings'][number];
type Road = MapContent['road'];

export interface CitySolid {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
  roughness: number;
  metalness: number;
  surface: 'solid' | 'water';
  collide: boolean;
}

export interface CityBatch {
  kind: 'box' | 'cylinder';
  sx: number;
  sy: number;
  sz: number;
  color: number;
  roughness: number;
  metalness: number;
  emissive: number;
  castShadow: boolean;
  count: number;
  matrices: Float32Array;
}

export interface CityCollider {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
}

export interface CostaVerde {
  solids: CitySolid[];
  batches: CityBatch[];
  colliders: CityCollider[];
  bounds: CityCollider[];
  houses: House[];
  roads: Road[];
}

interface Stamp {
  kind: 'box' | 'cylinder';
  sx: number;
  sy: number;
  sz: number;
  color: number;
  roughness: number;
  metalness: number;
  emissive: number;
  castShadow: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const variants: Array<Omit<House, 'x' | 'z' | 'yaw'>> = [
  { model: '/assets/buildings/house-a.glb', scale: 8, sx: 8.24, sy: 6.64, sz: 10.4 },
  { model: '/assets/buildings/house-b.glb', scale: 6, sx: 6.84, sy: 6.84, sz: 10.98 },
  { model: '/assets/buildings/house-e.glb', scale: 7, sx: 7.21, sy: 7.98, sz: 9.1 },
  { model: '/assets/buildings/house-f.glb', scale: 6.5, sx: 9.17, sy: 7.41, sz: 9.3 },
  { model: '/assets/buildings/house-k.glb', scale: 7, sx: 7.14, sy: 8.05, sz: 6.44 },
];

const paint = {
  sand: 0xe7d3a4,
  foam: 0xf4f7f8,
  water: 0x0e8fbe,
  rock: 0x6d6458,
  hill: 0x4a8a4c,
  pitch: 0x2f9e56,
  line: 0xf4f7f4,
  church: 0xf7f4ef,
  tile: 0xc4553a,
  stone: 0xf7f7f5,
  trunk: 0x6b4a2f,
  leaf: 0x1f8a40,
  leafDark: 0x176b32,
  pole: 0x2a2a2a,
  lamp: 0xfff1c9,
  glass: 0x8fbfce,
};

const casaColors = [0xe07a5f, 0xf2cc8f, 0x81b29a, 0xf7f4ef, 0xe9c46a, 0x2a9d8f, 0xe85d4c];
const towerColors = [0xf3f0e8, 0xd5dde4, 0xe7d7c3, 0xc9d4dc];
const towerHeights = [10, 14, 18, 24, 32, 42];
const umbrellaColors = [0xe23d3d, 0xf2c14e, 0x1f7a6b, 0x2f6fed, 0xf7f4ef];

export type CityFinish = 'sand' | 'grass' | 'paint';

export function cityFinish(color: number): CityFinish | undefined {
  if (color === paint.sand) return 'sand';
  if (color === paint.hill || color === paint.pitch) return 'grass';
  if (color === paint.church || casaColors.includes(color) || towerColors.includes(color)) {
    return 'paint';
  }
  return undefined;
}

export function buildCostaVerde(): CostaVerde {
  const solids: CitySolid[] = [];
  const colliders: CityCollider[] = [];
  const houses: House[] = [];
  const batcher = new Batcher();
  const south = island.centerZ - island.depth / 2;
  const north = island.centerZ + island.depth / 2;
  const halfW = island.width / 2;

  addWaterAndBeach(solids, south);
  addHillAndStatue(solids);
  addChurch(solids);
  addPitch(solids);
  addQuiosques(solids);
  addJunctions(solids);
  addHouses(houses);
  addTowers(batcher, colliders);
  addMorroHouses(batcher, colliders);
  addCasas(batcher, colliders);
  addPalms(batcher);
  addLamps(batcher);
  addUmbrellas(batcher);

  return {
    solids,
    batches: batcher.build(),
    colliders,
    bounds: bounds(south, north, halfW),
    houses,
    roads: roads(),
  };
}

function addWaterAndBeach(solids: CitySolid[], south: number): void {
  solid(
    solids,
    0,
    -0.45,
    island.centerZ,
    island.width + 900,
    0.7,
    island.depth + 900,
    paint.water,
    false,
    'water',
    0.04,
    0.84,
  );
  solid(
    solids,
    0,
    0.02,
    south + 30,
    island.width - 8,
    0.03,
    56,
    paint.sand,
    false,
    'solid',
    0.96,
    0,
  );
  solid(solids, 0, 0.03, south + 4, island.width - 12, 0.02, 5, paint.foam, false, 'solid', 0.7, 0);
}

function addHillAndStatue(solids: CitySolid[]): void {
  const x = -150;
  const z = 300;
  solid(solids, x, 2, z, 210, 4, 130, paint.hill, true, 'solid', 0.96, 0);
  solid(solids, x, 8, z + 16, 42, 16, 30, paint.rock, true, 'solid', 0.92, 0.02);
  const base = 16;
  solid(solids, x, base + 1.4, z + 16, 9, 2.8, 9, paint.stone, true);
  solid(solids, x, base + 8.2, z + 16, 2.4, 10.4, 1.8, paint.stone, false);
  solid(solids, x, base + 11.4, z + 16, 16, 1.15, 1.4, paint.stone, false);
  solid(solids, x, base + 14.2, z + 16, 1.8, 1.8, 1.8, paint.stone, false);
}

function addChurch(solids: CitySolid[]): void {
  const x = -340;
  const z = -50;
  solid(solids, x, 3.2, z, 12, 6.4, 18, paint.church, true);
  solid(solids, x, 7.1, z, 13.2, 1.5, 19.2, paint.tile, false);
  solid(solids, x, 7, z - 8, 4.4, 14, 4.4, paint.church, true);
  solid(solids, x, 14.6, z - 8, 5.2, 1.2, 5.2, paint.tile, false);
  solid(solids, x, 16.1, z - 8, 0.28, 1.6, 0.28, paint.stone, false);
  solid(solids, x, 16.5, z - 8, 1, 0.26, 0.26, paint.stone, false);
}

function addPitch(solids: CitySolid[]): void {
  const x = -310;
  const z = 82;
  solid(solids, x, 0.04, z, 42, 0.05, 26, paint.pitch, false, 'solid', 0.9, 0);
  solid(solids, x, 0.09, z - 13, 42, 0.02, 0.22, paint.line, false);
  solid(solids, x, 0.09, z + 13, 42, 0.02, 0.22, paint.line, false);
  solid(solids, x - 21, 0.09, z, 0.22, 0.02, 26, paint.line, false);
  solid(solids, x + 21, 0.09, z, 0.22, 0.02, 26, paint.line, false);
  solid(solids, x, 0.09, z, 0.22, 0.02, 26, paint.line, false);
  for (const end of [-21.2, 21.2]) {
    solid(solids, x + end, 1, z - 2.3, 0.12, 2, 0.12, paint.line, false);
    solid(solids, x + end, 1, z + 2.3, 0.12, 2, 0.12, paint.line, false);
    solid(solids, x + end, 2, z, 0.12, 0.12, 4.7, paint.line, false);
  }
}

function addQuiosques(solids: CitySolid[]): void {
  for (const x of [-90, 70, 190, 330]) {
    solid(solids, x, 1.5, -108, 4.2, 3, 4.2, paint.church, true);
    solid(solids, x, 3.15, -108, 5.4, 0.28, 5.4, paint.tile, false);
  }
}

function addJunctions(solids: CitySolid[]): void {
  const patches = [
    { x: 0, z: -84, sx: 30, sz: 24 },
    { x: -220, z: -84, sx: 28, sz: 24 },
    { x: 236, z: -84, sx: 30, sz: 24 },
    { x: 14, z: 88, sx: 28, sz: 24 },
    { x: 236, z: 88, sx: 30, sz: 24 },
  ];
  for (const patch of patches) {
    solid(
      solids,
      patch.x,
      0.03,
      patch.z,
      patch.sx,
      0.04,
      patch.sz,
      streetPaint.asphalt,
      false,
      'solid',
      0.94,
      0,
    );
  }
}

function addHouses(houses: House[]): void {
  const north = [48, 72, 128, 168];
  for (const side of [-1, 1] as const) {
    north.forEach((z, index) => addHouse(houses, side, z, index));
  }
}

function addTowers(batcher: Batcher, colliders: CityCollider[]): void {
  let n = 3;
  for (let x = 72; x <= 400; x += 38) {
    for (let z = -20; z <= 160; z += 36) {
      n += 1;
      if (Math.abs(z - 88) < 20) continue;
      if (Math.abs(x - 236) < 22) continue;
      const foot = unit(n) > 0.55 ? 16 : 12;
      const picked = towerHeights[Math.floor(unit(n + 5) * towerHeights.length)] ?? 18;
      const sy = Math.min(48, picked * (x > 280 ? 1.2 : 1));
      const color = towerColors[Math.floor(unit(n + 9) * towerColors.length)] ?? paint.church;
      batcher.add('box', foot, sy, foot, color, 0.52, 0.08, 0, true, x, sy / 2, z, 0);
      colliders.push({ x, y: sy / 2, z, hx: foot / 2, hy: sy / 2, hz: foot / 2 });
      const bandY = Math.min(sy * 0.55, sy - 1.4);
      const face = foot / 2 + 0.06;
      batcher.add(
        'box',
        foot * 0.72,
        1.5,
        0.1,
        paint.glass,
        0.08,
        0.5,
        0,
        false,
        x,
        bandY,
        z + face,
        0,
      );
      batcher.add(
        'box',
        foot * 0.72,
        1.5,
        0.1,
        paint.glass,
        0.08,
        0.5,
        0,
        false,
        x,
        bandY,
        z - face,
        0,
      );
    }
  }
}

function addMorroHouses(batcher: Batcher, colliders: CityCollider[]): void {
  const hillX = -150;
  const hillZ = 300;
  let n = 80;
  for (let ix = 0; ix < 7; ix += 1) {
    for (let iz = 0; iz < 4; iz += 1) {
      n += 1;
      const x = hillX - 90 + ix * 26;
      const z = hillZ - 48 + iz * 26;
      if (Math.abs(x - hillX) > 96 || Math.abs(z - hillZ) > 56) continue;
      if (Math.abs(x - hillX) < 28 && Math.abs(z - (hillZ + 16)) < 22) continue;
      const sx = 4.6 + (ix % 2) * 1.6;
      const sz = 5.2 + (iz % 2);
      const sy = 3 + unit(n) * 4.2;
      const color = casaColors[Math.floor(unit(n + 4) * casaColors.length)] ?? paint.church;
      const y = 4 + sy / 2 + 0.04;
      batcher.add('box', sx, sy, sz, color, 0.84, 0.02, 0, true, x, y, z, 0);
      colliders.push({ x, y, z, hx: sx / 2, hy: sy / 2, hz: sz / 2 });
    }
  }
}

function addCasas(batcher: Batcher, colliders: CityCollider[]): void {
  let n = 200;
  for (let x = -130; x >= -420; x -= 48) {
    for (let z = -40; z <= 160; z += 48) {
      n += 1;
      if (unit(n) < 0.42) continue;
      if (Math.abs(x + 220) < 22) continue;
      if (Math.abs(x + 310) < 30 && Math.abs(z - 82) < 24) continue;
      if (Math.abs(x + 340) < 18 && Math.abs(z + 50) < 24) continue;
      const sy = 3.2 + unit(n + 2) * 3.2;
      const color = casaColors[Math.floor(unit(n + 6) * casaColors.length)] ?? paint.church;
      batcher.add('box', 7, sy, 7, color, 0.84, 0.02, 0, true, x, sy / 2, z, 0);
      colliders.push({ x, y: sy / 2, z, hx: 3.5, hy: sy / 2, hz: 3.5 });
    }
  }
}

function addPalms(batcher: Batcher): void {
  let n = 400;
  for (let z = -48; z <= 36; z += 16) {
    n += 1;
    addPalm(batcher, -8.6, z, n);
    addPalm(batcher, 8.6, z, n + 5);
  }
  for (let x = -400; x <= 400; x += 18) {
    if (nearJunction(x)) continue;
    n += 1;
    addPalm(batcher, x, -68, n);
    addPalm(batcher, x, -104, n + 17);
  }
}

function addLamps(batcher: Batcher): void {
  for (let z = -55; z <= 180; z += 28) {
    if (z > 70 && z < 106) continue;
    addLamp(batcher, -10.5, z);
    addLamp(batcher, 10.5, z);
  }
  for (let x = -400; x <= 400; x += 30) {
    if (nearJunction(x)) continue;
    addLamp(batcher, x, -100);
    addLamp(batcher, x, -76);
  }
  for (let z = -55; z <= 160; z += 30) {
    if (z > 70 && z < 106) continue;
    addLamp(batcher, 224, z);
    addLamp(batcher, 248, z);
  }
  for (let z = -55; z <= 150; z += 32) {
    addLamp(batcher, -231, z);
    addLamp(batcher, -209, z);
  }
}

function addUmbrellas(batcher: Batcher): void {
  let n = 0;
  for (let x = -360; x <= 360; x += 26) {
    if ([-90, 70, 190, 330].some((spot) => Math.abs(spot - x) < 8)) continue;
    const color = umbrellaColors[n % umbrellaColors.length] ?? paint.lamp;
    n += 1;
    batcher.add('cylinder', 0.05, 1.7, 0.05, paint.church, 0.5, 0.05, 0, false, x, 0.85, -112, 0);
    batcher.add('box', 1.7, 0.1, 1.7, color, 0.7, 0, 0, false, x, 1.72, -112, 0);
  }
}

function addPalm(batcher: Batcher, x: number, z: number, n: number): void {
  const height = 4.6 + unit(n) * 1.4;
  batcher.add('cylinder', 0.2, height, 0.2, paint.trunk, 0.9, 0, 0, false, x, height / 2, z, 0);
  for (let i = 0; i < 5; i += 1) {
    const yaw = (i * Math.PI * 2) / 5 + unit(n + i) * 0.35;
    const reach = 1.15;
    batcher.add(
      'box',
      0.36,
      0.12,
      2.5,
      i % 2 === 0 ? paint.leaf : paint.leafDark,
      0.75,
      0,
      0,
      false,
      x + Math.sin(yaw) * reach,
      height + 0.08,
      z + Math.cos(yaw) * reach,
      yaw,
    );
  }
}

function addLamp(batcher: Batcher, x: number, z: number): void {
  batcher.add('cylinder', 0.07, 4.8, 0.07, paint.pole, 0.55, 0.45, 0, false, x, 2.4, z, 0);
  batcher.add('box', 0.55, 0.14, 0.28, paint.lamp, 0.32, 0.08, 0xffe2a2, false, x, 4.85, z, 0);
}

function addHouse(houses: House[], side: -1 | 1, z: number, index: number): void {
  const variant = variants[index % variants.length];
  if (!variant) return;
  houses.push({
    ...variant,
    x: side * 14,
    z,
    yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2,
  });
}

function roads(): Road[] {
  return [
    roadZ(0, -78, 74, 7),
    roadZ(0, 102, 210, 7),
    roadX(88, 22, 214, 8),
    roadX(88, 258, 420, 8),
    roadZ(236, -70, 74, 9),
    roadZ(236, 102, 180, 9),
    roadZ(-220, -70, 170, 8),
    roadX(-88, -430, -242, 14),
    roadX(-88, -198, -24, 14),
    roadX(-88, 24, 214, 14),
    roadX(-88, 258, 430, 14),
  ];
}

function roadZ(x: number, z0: number, z1: number, width: number): Road {
  return { x, z0, z1, width, axis: 'z', ...streetPaint };
}

function roadX(z: number, x0: number, x1: number, width: number): Road {
  return { x: z, z0: x0, z1: x1, width, axis: 'x', ...streetPaint };
}

function bounds(south: number, north: number, halfW: number): CityCollider[] {
  const y = 8;
  const hy = 8;
  return [
    { x: 0, y, z: south, hx: halfW + 4, hy, hz: 2 },
    { x: 0, y, z: north, hx: halfW + 4, hy, hz: 2 },
    { x: -halfW, y, z: island.centerZ, hx: 2, hy, hz: island.depth / 2 + 4 },
    { x: halfW, y, z: island.centerZ, hx: 2, hy, hz: island.depth / 2 + 4 },
  ];
}

function nearJunction(x: number): boolean {
  return Math.abs(x) < 26 || Math.abs(x + 220) < 26 || Math.abs(x - 236) < 26;
}

function solid(
  solids: CitySolid[],
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color: number,
  collide: boolean,
  surface: 'solid' | 'water' = 'solid',
  roughness = 0.86,
  metalness = 0.02,
): void {
  solids.push({ x, y, z, sx, sy, sz, color, roughness, metalness, surface, collide });
}

function unit(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

class Batcher {
  private readonly stamps: Stamp[] = [];

  add(
    kind: 'box' | 'cylinder',
    sx: number,
    sy: number,
    sz: number,
    color: number,
    roughness: number,
    metalness: number,
    emissive: number,
    castShadow: boolean,
    x: number,
    y: number,
    z: number,
    yaw: number,
  ): void {
    this.stamps.push({
      kind,
      sx,
      sy,
      sz,
      color,
      roughness,
      metalness,
      emissive,
      castShadow,
      x,
      y,
      z,
      yaw,
    });
  }

  build(): CityBatch[] {
    const groups = new Map<string, Stamp[]>();
    for (const stamp of this.stamps) {
      const key = [
        stamp.kind,
        stamp.sx,
        stamp.sy,
        stamp.sz,
        stamp.color,
        stamp.roughness,
        stamp.metalness,
        stamp.emissive,
        stamp.castShadow ? 1 : 0,
      ].join('|');
      const list = groups.get(key);
      if (list) list.push(stamp);
      else groups.set(key, [stamp]);
    }
    const batches: CityBatch[] = [];
    for (const list of groups.values()) {
      const first = list[0];
      if (!first) continue;
      const matrices = new Float32Array(list.length * 16);
      list.forEach((stamp, index) => {
        writeYawMatrix(matrices, index, stamp.x, stamp.y, stamp.z, stamp.yaw);
      });
      batches.push({
        kind: first.kind,
        sx: first.sx,
        sy: first.sy,
        sz: first.sz,
        color: first.color,
        roughness: first.roughness,
        metalness: first.metalness,
        emissive: first.emissive,
        castShadow: first.castShadow,
        count: list.length,
        matrices,
      });
    }
    return batches;
  }
}
