/** Rendering surface used by gameplay. Implementations may use Three.js; callers must not. */

import type { Disposable } from '../core/disposable';
import type { Quat, Vec3 } from '../core/math';
import type { ShadowQuality, Sharpness } from './display';

export type MeshKind = 'box' | 'capsule' | 'cylinder';

export type SurfaceFinish =
  'asphalt' | 'concrete' | 'sidewalk' | 'sand' | 'grass' | 'paint' | 'lane';

export interface MeshDesc {
  kind: MeshKind;
  /** Box: full size. Capsule: x radius, y cylinder length. Cylinder: x radius, y length. */
  size: Vec3;
  color: number;
  position: Vec3;
  rotation?: Quat;
  parent?: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  surface?: 'solid' | 'water';
  finish?: SurfaceFinish;
  /** Draws the collider as a wire box so its edges stay visible. */
  wireframe?: boolean;
}

export interface InstanceBatchDesc {
  size: Vec3;
  color: number;
  count: number;
  matrices: Float32Array;
  /** Per-instance rgb, length count * 3, values 0 to 1. */
  colors?: Float32Array;
  kind?: 'box' | 'cylinder';
  /** Unit mesh. Scale lives in the instance matrix. UVs follow world meters. */
  unit?: boolean;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  castShadow?: boolean;
  finish?: SurfaceFinish;
}

export interface TerrainDesc {
  originX: number;
  originZ: number;
  sizeX: number;
  sizeZ: number;
  rows: number;
  cols: number;
  heights: Float32Array;
  colors: Float32Array;
}

export type ClipKey = 'idle' | 'walk' | 'run' | 'punch' | 'jump' | 'die' | 'sit';

export interface ModelDesc {
  url: string;
  position: Vec3;
  rotation?: Quat;
  scale?: number;
  /** Local shift applied before scale, so a model's feet can sit on the ground. */
  offset?: Vec3;
  alignYaw?: number;
  clips?: Partial<Record<ClipKey, string>>;
  /** Preloaded model whose clips drive this mesh. The mesh file has the matching skeleton. */
  clipSource?: string;
  /** Body paint, used by traffic variants. Wheels and glass stay shared. */
  tint?: number;
}

export interface Renderer extends Disposable {
  readonly domElement: HTMLCanvasElement;
  setSize(width: number, height: number): void;
  setGraphics(quality: { shadows: ShadowQuality; sharpness: Sharpness }): void;
  setCamera(position: Vec3, target: Vec3): void;
  /** Pixel position on the canvas. `behind` is true when the point is behind the camera. */
  project(point: Vec3): { x: number; y: number; behind: boolean };
  setTimeOfDay(time: number): void;
  timeOfDay(): number;
  prepare(): Promise<void>;
  preloadModel(url: string): Promise<void>;
  addMesh(desc: MeshDesc): number;
  addModel(desc: ModelDesc): number;
  addInstances(desc: InstanceBatchDesc): number;
  addTerrain(desc: TerrainDesc): number;
  setMeshTransform(id: number, position: Vec3, rotation: Quat): void;
  setMeshVisible(id: number, visible: boolean): void;
  /** Replaces instance matrices. `matrices` is count * 16, `colors` is count * 3. */
  setInstances(id: number, matrices: Float32Array, colors: Float32Array, count: number): void;
  playClip(id: number, clip: ClipKey, token: number): void;
  tick(dt: number): void;
  drawCalls(): number;
  render(): void;
}
