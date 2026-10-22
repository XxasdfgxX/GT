/** Groups scaled unit meshes so one InstancedMesh covers a chunk and a material. */

import { writeTransformMatrix } from '../../engine/core/math';
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
  kind: 'box' | 'cylinder';
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
}

export interface CityMesh {
  kind: 'box' | 'cylinder';
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
        colors[i * 3] = ((stamp.color >> 16) & 255) / 255;
        colors[i * 3 + 1] = ((stamp.color >> 8) & 255) / 255;
        colors[i * 3 + 2] = (stamp.color & 255) / 255;
      }
      meshes.push({
        kind: first.kind,
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
      });
    }
    return meshes;
  }
}
