/** Rendering surface used by gameplay. Implementations may use Three.js; callers must not. */

import type { Disposable } from '../core/disposable';
import type { Quat, Vec3 } from '../core/math';

export type MeshKind = 'box' | 'capsule' | 'cylinder';

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
}

export interface InstanceBatchDesc {
  size: Vec3;
  color: number;
  count: number;
  matrices: Float32Array;
  kind?: 'box' | 'cylinder';
  roughness?: number;
  metalness?: number;
  emissive?: number;
  castShadow?: boolean;
}

export type ClipKey = 'idle' | 'walk' | 'run' | 'punch' | 'jump';

export interface ModelDesc {
  url: string;
  position: Vec3;
  rotation?: Quat;
  scale?: number;
  /** Local shift applied before scale, so a model's feet can sit on the ground. */
  offset?: Vec3;
  alignYaw?: number;
  clips?: Partial<Record<ClipKey, string>>;
}

export interface Renderer extends Disposable {
  readonly domElement: HTMLCanvasElement;
  setSize(width: number, height: number): void;
  setCamera(position: Vec3, target: Vec3): void;
  setTimeOfDay(time: number): void;
  prepare(): Promise<void>;
  preloadModel(url: string): Promise<void>;
  addMesh(desc: MeshDesc): number;
  addModel(desc: ModelDesc): number;
  addInstances(desc: InstanceBatchDesc): number;
  setMeshTransform(id: number, position: Vec3, rotation: Quat): void;
  setMeshVisible(id: number, visible: boolean): void;
  playClip(id: number, clip: ClipKey, token: number): void;
  tick(dt: number): void;
  drawCalls(): number;
  render(): void;
}
