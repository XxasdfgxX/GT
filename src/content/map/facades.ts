/** Ground floor, repeated floors, and roof props as instanced modules. */

import { chunkIndex, type CityBatcher } from './batch';
import type { Footprint } from './blocks';
import { mulberry32 } from './rng';

export interface ShopDoor {
  x: number;
  z: number;
}

const glass = 0x9ec4ce;
const tank = 0xd5d8dc;
const graffitiColors = [0x1a1a1a, 0x243024, 0x2a2428];

export function buildFacades(footprints: Footprint[], batch: CityBatcher): ShopDoor[] {
  const doors: ShopDoor[] = [];
  for (const lot of footprints) {
    const rng = mulberry32(0x51a7 + lot.seed);
    const fx = Math.sin(lot.yaw);
    const fz = Math.cos(lot.yaw);
    batch.add({
      kind: 'box',
      finish: 'paint',
      sx: lot.sx,
      sy: lot.sy,
      sz: lot.sz,
      x: lot.x,
      y: lot.y + lot.sy / 2,
      z: lot.z,
      yaw: lot.yaw,
      pitch: 0,
      color: lot.color,
      roughness: 0.86,
      metalness: 0.02,
      emissive: 0,
      castShadow: true,
      chunk: lot.chunk,
      lod: 'near',
    });
    batch.add({
      kind: 'box',
      finish: 'paint',
      sx: lot.sx,
      sy: lot.sy,
      sz: lot.sz,
      x: lot.x,
      y: lot.y + lot.sy / 2,
      z: lot.z,
      yaw: lot.yaw,
      pitch: 0,
      color: lot.color,
      roughness: 0.9,
      metalness: 0,
      emissive: 0,
      castShadow: true,
      chunk: lot.chunk,
      lod: 'far',
    });
    const front = lot.sz / 2 + 0.08;
    if (lot.floors > 1) {
      batch.add({
        kind: 'box',
        finish: 'flat',
        sx: lot.sx * 0.72,
        sy: Math.max(1.2, (lot.floors - 1) * 2.15),
        sz: 0.12,
        x: lot.x + fx * front,
        y: lot.y + lot.sy * 0.58,
        z: lot.z + fz * front,
        yaw: lot.yaw,
        pitch: 0,
        color: glass,
        roughness: 0.08,
        metalness: 0.45,
        emissive: 0,
        castShadow: false,
        chunk: lot.chunk,
        lod: 'near',
      });
    }
    if (lot.kind === 'shop' || lot.kind === 'tower') {
      batch.add({
        kind: 'box',
        finish: 'flat',
        sx: lot.sx * 0.92,
        sy: 0.12,
        sz: 1.1,
        x: lot.x + fx * (front + 0.4),
        y: lot.y + 3.05,
        z: lot.z + fz * (front + 0.4),
        yaw: lot.yaw,
        pitch: 0,
        color: lot.color,
        roughness: 0.7,
        metalness: 0,
        emissive: 0,
        castShadow: true,
        chunk: lot.chunk,
        lod: 'near',
      });
      doors.push({ x: lot.x + fx * (front + 1.4), z: lot.z + fz * (front + 1.4) });
    }
    if ((lot.kind === 'residential' || lot.kind === 'tower') && rng() > 0.35) {
      batch.add({
        kind: 'box',
        finish: 'concrete',
        sx: lot.sx * 0.55,
        sy: 0.12,
        sz: 0.9,
        x: lot.x + fx * (front + 0.35),
        y: lot.y + Math.min(lot.sy - 1, 9),
        z: lot.z + fz * (front + 0.35),
        yaw: lot.yaw,
        pitch: 0,
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0,
        emissive: 0,
        castShadow: true,
        chunk: lot.chunk,
        lod: 'near',
      });
    }
    if (rng() > 0.45) {
      batch.add({
        kind: 'box',
        finish: 'flat',
        sx: 1.1,
        sy: 1.1,
        sz: 1.1,
        x: lot.x - fx * (lot.sz * 0.2),
        y: lot.y + lot.sy + 0.55,
        z: lot.z - fz * (lot.sz * 0.2),
        yaw: 0,
        pitch: 0,
        color: tank,
        roughness: 0.55,
        metalness: 0.35,
        emissive: 0,
        castShadow: true,
        chunk: lot.chunk,
        lod: 'near',
      });
    }
    if (rng() > 0.5) {
      batch.add({
        kind: 'box',
        finish: 'flat',
        sx: 0.08,
        sy: 2.4,
        sz: 0.08,
        x: lot.x + fx * 0.2,
        y: lot.y + lot.sy + 1.2,
        z: lot.z,
        yaw: 0,
        pitch: 0,
        color: 0x2a2a2a,
        roughness: 0.5,
        metalness: 0.4,
        emissive: 0,
        castShadow: false,
        chunk: lot.chunk,
        lod: 'near',
      });
    }
    if (rng() > 0.92) {
      const tint = graffitiColors[lot.seed % graffitiColors.length] ?? 0x1a1a1a;
      batch.add({
        kind: 'box',
        finish: 'flat',
        sx: lot.sx * 0.35,
        sy: 1.4,
        sz: 0.05,
        x: lot.x + fx * (front + 0.02),
        y: lot.y + 1.8,
        z: lot.z + fz * (front + 0.02),
        yaw: lot.yaw,
        pitch: 0,
        color: tint,
        roughness: 0.95,
        metalness: 0,
        emissive: 0,
        castShadow: false,
        chunk: chunkIndex(lot.x, lot.z),
        lod: 'near',
      });
    }
  }
  return doors;
}
