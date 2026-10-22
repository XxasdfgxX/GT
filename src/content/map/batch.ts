/** Groups scaled unit meshes so one InstancedMesh covers a chunk and a material. */

import { srgbToLinear, writeTransformMatrix } from '../../engine/core/math';
import { islandBounds } from './island-shape';

export const CHUNK_METERS = 128;

export type MeshFinish =
  | 'asphalt'
  | 'concrete'
  | 'sidewalk'
  | 'sand'
  | 'grass'
  | 'paint'
  | 'lane'
  | 'plaza'
  | 'rock'
  | 'dirt'
  | 'brick'
  | 'tile'
  | 'concrete-raw'
  | 'roof-concrete'
  | 'roof-clay'
  | 'flat';

export type MeshLod = 'near' | 'far' | 'always';

export interface Stamp {
  /** `model` places the glTF at `model`; sx, sy and sz scale it. */
  kind: 'box' | 'cylinder' | 'model';
  model?: string;
  finish: MeshFinish;
  sx: number;
  sy: number;
  sz: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  color: number;
  roughness: number;
  metalness: number;
  emissive: number;
  castShadow: boolean;
  chunk: number;
  lod: MeshLod;
  /** Window grid for a building wall: floor height, style, ground floor, seed. */
  facade?: Facade;
}

/** Floor height in meters, facade style index, ground floor (0 plain, 1 shopfront), seed. */
export type Facade = readonly [number, number, number, number];

export interface CityMesh {
  kind: 'box' | 'cylinder' | 'model';
  /** glTF url when `kind` is `model`. */
  model?: string;
  finish: MeshFinish;
  roughness: number;
  metalness: number;
  emissive: number;
  castShadow: boolean;
  count: number;
  matrices: Float32Array;
  colors: Float32Array;
  chunk: number;
  lod: MeshLod;
  /** Four floats per instance when any stamp in the group is a wall; zeros draw no windows. */
  facade: Float32Array | null;
}

export interface BoxCollider {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
  pitch: number;
  chunk: number;
}

const stride = 64;

export function chunkIndex(x: number, z: number): number {
  const bounds = islandBounds();
  const ix = Math.floor((x - (bounds.minX - 64)) / CHUNK_METERS);
  const iz = Math.floor((z - (bounds.minZ - 64)) / CHUNK_METERS);
  return iz * stride + ix;
}

export class CityBatcher {
  private readonly stamps: Stamp[] = [];

  add(stamp: Stamp): void {
    this.stamps.push(stamp);
  }

  build(): CityMesh[] {
    const groups = new Map<string, Stamp[]>();
    for (const stamp of this.stamps) {
      const key = [
        stamp.kind,
        stamp.model ?? '',
        stamp.finish,
        stamp.chunk,
        stamp.lod,
        stamp.roughness,
        stamp.metalness,
        stamp.emissive,
        stamp.castShadow ? 1 : 0,
      ].join('|');
      const list = groups.get(key);
      if (list) list.push(stamp);
      else groups.set(key, [stamp]);
    }
    const meshes: CityMesh[] = [];
    for (const list of groups.values()) {
      const first = list[0];
      if (!first) continue;
      const matrices = new Float32Array(list.length * 16);
      const colors = new Float32Array(list.length * 3);
      const facade = list.some((stamp) => stamp.facade) ? new Float32Array(list.length * 4) : null;
      for (let i = 0; i < list.length; i += 1) {
        const stamp = list[i];
        if (!stamp) continue;
        writeTransformMatrix(
          matrices,
          i,
          stamp.x,
          stamp.y,
          stamp.z,
          stamp.yaw,
          stamp.pitch,
          stamp.sx,
          stamp.sy,
          stamp.sz,
        );
        // Hex colors are sRGB; instance colors are read as linear, so unconverted they washed out.
        colors[i * 3] = srgbToLinear(((stamp.color >> 16) & 255) / 255);
        colors[i * 3 + 1] = srgbToLinear(((stamp.color >> 8) & 255) / 255);
        colors[i * 3 + 2] = srgbToLinear((stamp.color & 255) / 255);
        if (facade && stamp.facade) facade.set(stamp.facade, i * 4);
      }
      meshes.push({
        kind: first.kind,
        ...(first.model ? { model: first.model } : {}),
        finish: first.finish,
        roughness: first.roughness,
        metalness: first.metalness,
        emissive: first.emissive,
        castShadow: first.castShadow,
        count: list.length,
        matrices,
        colors,
        chunk: first.chunk,
        lod: first.lod,
        facade,
      });
    }
    return meshes;
  }
}
