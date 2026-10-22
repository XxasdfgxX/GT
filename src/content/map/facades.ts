/** Walls with window grids, floor ledges, balconies, parapets and roof props, as instanced modules. */

import type { CityBatcher, MeshFinish, Stamp } from './batch';
import type { Footprint } from './blocks';
import { mulberry32 } from './rng';

export interface ShopDoor {
  x: number;
  z: number;
}

/** Index order is the window table in the facade shader. */
export const FACADE_STYLES = [
  'plaster-grid',
  'concrete-band',
  'brick-raw',
  'tile-base',
  'glass-curtain',
  'colonial',
] as const;

export type FacadeStyle = (typeof FACADE_STYLES)[number];

/** Target bay width per style, in meters. The shader splits each wall the same way. */
export const FACADE_BAYS: Record<FacadeStyle, number> = {
  'plaster-grid': 3.0,
  'concrete-band': 3.2,
  'brick-raw': 2.6,
  'tile-base': 3.0,
  'glass-curtain': 1.6,
  colonial: 2.8,
};

const wallFinish: Record<FacadeStyle, MeshFinish> = {
  'plaster-grid': 'paint',
  'concrete-band': 'concrete-raw',
  'brick-raw': 'brick',
  'tile-base': 'paint',
  'glass-curtain': 'paint',
  colonial: 'paint',
};

const railGlass = 0x9ec4ce;
const tankBlue = 0x2f6db5;
const acWhite = 0xe4e4e0;
const awningColors = [0xc4553a, 0x2f6d8a, 0x3d7a45, 0xe9c46a, 0x8a3d6b];
const graffitiColors = [0x1a1a1a, 0x243024, 0x2a2428];

export function pickStyle(kind: Footprint['kind'], rng: () => number): FacadeStyle {
  const roll = rng();
  if (kind === 'tower') return roll < 0.35 ? 'glass-curtain' : 'concrete-band';
  if (kind === 'residential') {
    if (roll < 0.5) return 'plaster-grid';
    return roll < 0.75 ? 'brick-raw' : 'concrete-band';
  }
  if (kind === 'shop') return roll < 0.6 ? 'tile-base' : 'colonial';
  return roll < 0.6 ? 'plaster-grid' : 'brick-raw';
}

/** Bays across a wall, as the shader counts them. */
export function bayCount(width: number, style: FacadeStyle): number {
  return Math.max(1, Math.floor(width / FACADE_BAYS[style] + 0.5));
}

export function buildFacades(footprints: Footprint[], batch: CityBatcher): ShopDoor[] {
  const doors: ShopDoor[] = [];
  for (const lot of footprints) {
    const rng = mulberry32(0x51a7 + lot.seed);
    const style = pickStyle(lot.kind, rng);
    const finish = wallFinish[style];
    // Brick and raw concrete show their own color; plaster takes the lot's paint.
    const tint = finish === 'paint' ? lot.color : 0xf2f0ec;
    const floorH = lot.sy / Math.max(1, lot.floors);
    const shopfront = lot.kind === 'shop' || lot.kind === 'tower' ? 1 : 0;
    const facade = [floorH, FACADE_STYLES.indexOf(style), shopfront, lot.seed % 97] as const;
    const fx = Math.sin(lot.yaw);
    const fz = Math.cos(lot.yaw);
    const rx = Math.cos(lot.yaw);
    const rz = -Math.sin(lot.yaw);
    const top = lot.y + lot.sy;
    const front = lot.sz / 2;
    // Silhouette: some towers step back for their top three floors, some houses get a clay gable.
    const setback = lot.kind === 'tower' && lot.floors >= 8 && rng() < 0.3;
    const gable = lot.kind === 'house' && rng() < 0.4;
    const lowerFloors = setback ? lot.floors - 3 : lot.floors;
    const lowerTop = lot.y + lowerFloors * floorH;
    /** A box against the front wall: `along` from the center to the right, `out` from the wall. */
    const onFront = (
      along: number,
      y: number,
      out: number,
      size: [number, number, number],
      look: Pick<Stamp, 'finish' | 'color' | 'roughness' | 'metalness' | 'emissive'>,
      castShadow: boolean,
      pitch = 0,
    ) => {
      batch.add({
        kind: 'box',
        sx: size[0],
        sy: size[1],
        sz: size[2],
        x: lot.x + rx * along + fx * (front + out),
        y,
        z: lot.z + rz * along + fz * (front + out),
        yaw: lot.yaw,
        pitch,
        castShadow,
        chunk: lot.chunk,
        lod: 'near',
        ...look,
      });
    };
    const plain = (finish: MeshFinish, color: number, roughness = 0.85) => ({
      finish,
      color,
      roughness,
      metalness: 0,
      emissive: 0,
    });

    for (const lod of ['near', 'far'] as const) {
      batch.add({
        kind: 'box',
        finish,
        sx: lot.sx,
        sy: lowerTop - lot.y,
        sz: lot.sz,
        x: lot.x,
        y: (lot.y + lowerTop) / 2,
        z: lot.z,
        yaw: lot.yaw,
        pitch: 0,
        color: tint,
        roughness: lod === 'near' ? 0.86 : 0.9,
        metalness: lod === 'near' ? 0.02 : 0,
        emissive: 0,
        castShadow: true,
        chunk: lot.chunk,
        lod,
        facade,
      });
    }

    /** A flat roof: a slab inside a parapet, so the top reads as a roof and not as more wall. */
    const flatRoof = (width: number, depth: number, y: number, inset: number) => {
      const parapet = 0.9;
      onFront(
        0,
        y + 0.04,
        -inset - depth / 2,
        [width - 0.3, 0.08, depth - 0.3],
        plain('roof-concrete', 0xffffff, 0.9),
        false,
      );
      for (const [along, out, sx, sz] of [
        [0, -inset - 0.1, width, 0.2],
        [0, -inset - depth + 0.1, width, 0.2],
        [-width / 2 + 0.1, -inset - depth / 2, 0.2, depth],
        [width / 2 - 0.1, -inset - depth / 2, 0.2, depth],
      ] as const) {
        onFront(along, y + parapet / 2, out, [sx, parapet, sz], plain(finish, tint), true);
      }
    };
    if (gable) {
      // A square box turned 45° along the ridge: its top half is the gable, the rest sits in the walls.
      const side = (lot.sz / Math.SQRT2) * 1.04;
      batch.add({
        kind: 'box',
        finish: 'roof-clay',
        sx: lot.sx + 0.4,
        sy: side,
        sz: side,
        x: lot.x,
        y: lowerTop,
        z: lot.z,
        yaw: lot.yaw,
        pitch: Math.PI / 4,
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0,
        emissive: 0,
        castShadow: true,
        chunk: lot.chunk,
        lod: 'always',
      });
    } else flatRoof(lot.sx, lot.sz, lowerTop, 0);
    if (setback) {
      // The top three floors, stepped back on every side, on the roof terrace below.
      const upperX = Math.max(6, lot.sx - 4);
      const upperZ = Math.max(6, lot.sz - 3);
      for (const lod of ['near', 'far'] as const) {
        batch.add({
          kind: 'box',
          finish,
          sx: upperX,
          sy: top - lowerTop,
          sz: upperZ,
          x: lot.x,
          y: (lowerTop + top) / 2,
          z: lot.z,
          yaw: lot.yaw,
          pitch: 0,
          color: tint,
          roughness: 0.86,
          metalness: 0,
          emissive: 0,
          castShadow: true,
          chunk: lot.chunk,
          lod,
          facade: [floorH, facade[1], 0, facade[3] + 1],
        });
      }
      flatRoof(upperX, upperZ, top, (lot.sz - upperZ) / 2);
    }

    const bays = bayCount(lot.sx, style);
    const bayW = lot.sx / bays;
    const bayCenter = (bay: number) => (bay + 0.5) * bayW - lot.sx / 2;

    // A ledge at every floor line: concrete bands carry the look, plaster gets a thin one.
    if (lot.floors > 1 && style !== 'glass-curtain') {
      const deep = style === 'concrete-band' ? 0.35 : 0.12;
      const tall = style === 'concrete-band' ? 0.32 : 0.14;
      for (let level = 1; level < lowerFloors; level += 1) {
        onFront(
          0,
          lot.y + level * floorH,
          deep / 2,
          [lot.sx + 0.04, tall, deep],
          plain('concrete', 0xe8e6e0),
          false,
        );
      }
    }

    // Balconies on homes and towers, lined up with the window bays.
    if ((lot.kind === 'residential' || lot.kind === 'tower') && style !== 'glass-curtain') {
      const share = style === 'concrete-band' ? 0.7 : 0.45;
      for (let level = 1; level < lowerFloors; level += 1) {
        for (let bay = 0; bay < bays; bay += 1) {
          if (rng() > share) continue;
          const along = bayCenter(bay);
          const y = lot.y + level * floorH;
          const width = bayW * 0.82;
          onFront(along, y + 0.06, 0.6, [width, 0.12, 1.2], plain('concrete', 0xefede8), true);
          onFront(
            along,
            y + 0.6,
            1.18,
            [width, 1.0, 0.04],
            { finish: 'flat', color: railGlass, roughness: 0.08, metalness: 0.3, emissive: 0 },
            false,
          );
        }
      }
    }

    // Split air conditioners under a few windows: the most Brazilian thing on a wall.
    if (lot.kind !== 'shop' && style !== 'glass-curtain') {
      for (let level = lot.kind === 'house' ? 0 : 1; level < lowerFloors; level += 1) {
        for (let bay = 0; bay < bays; bay += 1) {
          if (rng() > 0.18) continue;
          onFront(
            bayCenter(bay) + bayW * 0.22,
            lot.y + level * floorH + floorH * 0.22,
            0.18,
            [0.8, 0.5, 0.3],
            plain('flat', acWhite, 0.5),
            true,
          );
        }
      }
    }

    if (lot.kind === 'shop' || lot.kind === 'tower') {
      // A canvas awning over the shopfront, sloping down to the street.
      const awning = awningColors[lot.seed % awningColors.length] ?? 0xc4553a;
      onFront(
        0,
        lot.y + Math.min(floorH, 3.2) - 0.1,
        0.65,
        [lot.sx * 0.9, 0.06, 1.3],
        plain('flat', awning, 0.9),
        true,
        -0.22,
      );
      // Sign band above the awning, lit so bloom picks it up.
      onFront(
        0,
        lot.y + Math.min(floorH, 3.2) + 0.35,
        0.06,
        [lot.sx * 0.6, 0.45, 0.1],
        { finish: 'flat', color: 0xfff4dc, roughness: 0.4, metalness: 0, emissive: 0xffe7b0 },
        false,
      );
      if (style === 'tile-base') {
        // Tiled skirt under the glass.
        onFront(
          0,
          lot.y + 0.1,
          0.03,
          [lot.sx + 0.02, 0.2, 0.06],
          plain('tile', 0xffffff, 0.3),
          false,
        );
      }
      doors.push({ x: lot.x + fx * (front + 1.4), z: lot.z + fz * (front + 1.4) });
    }

    // A blue fiberglass water tank on most flat roofs.
    if (rng() > 0.35 && !gable) {
      batch.add({
        kind: 'cylinder',
        finish: 'flat',
        sx: 1.3,
        sy: 1.1,
        sz: 1.3,
        x: lot.x - fx * (lot.sz * 0.2) + rx * (lot.sx * 0.2),
        y: top + 0.08 + 0.55,
        z: lot.z - fz * (lot.sz * 0.2) + rz * (lot.sx * 0.2),
        yaw: 0,
        pitch: 0,
        color: tankBlue,
        roughness: 0.45,
        metalness: 0,
        emissive: 0,
        castShadow: true,
        chunk: lot.chunk,
        lod: 'near',
      });
    }
    // Towers keep their lift machine room on top.
    if (lot.kind === 'tower') {
      batch.add({
        kind: 'box',
        finish,
        sx: Math.min(4, lot.sx * 0.35),
        sy: 2.6,
        sz: Math.min(4, lot.sz * 0.35),
        x: lot.x,
        y: top + 1.3,
        z: lot.z,
        yaw: lot.yaw,
        pitch: 0,
        color: tint,
        roughness: 0.86,
        metalness: 0,
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
        y: top + 1.2,
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
      const ink = graffitiColors[lot.seed % graffitiColors.length] ?? 0x1a1a1a;
      onFront(0, lot.y + 1.8, 0.02, [lot.sx * 0.35, 1.4, 0.05], plain('flat', ink, 0.95), false);
    }
  }
  return doors;
}
