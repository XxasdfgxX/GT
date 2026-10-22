/** Spawns the island shell. Chunk meshes and building colliders stream in around the player. */

import type { CityMesh } from '../../../content/map/batch';
import { PAINTED_MODELS } from '../../../content/map/props';
import type { CostaVerde } from '../../../content/city';
import type { GameContext } from '../../context';
import { quatFromYawPitch } from '../../../engine/core/math';
import { chunkIndex } from '../../../content/map/batch';

const yawScratch = { x: 0, y: 0, z: 0, w: 1 };

interface LiveChunk {
  meshIds: number[];
  bodyIds: number[];
  shellIds: number[];
  near: number[];
  far: number[];
  always: number[];
  mode: 'near' | 'far' | 'off';
}

let bound: CostaVerde | undefined;
const live = new Map<number, LiveChunk>();
const byChunk = new Map<number, CityMesh[]>();

export function spawnMap(ctx: GameContext, city: CostaVerde): void {
  bound = city;
  live.clear();
  byChunk.clear();
  const { terrain } = city;
  ctx.renderer.addTerrain(terrain);
  ctx.physics.createHeightfield({
    position: {
      x: terrain.originX + terrain.sizeX / 2,
      y: 0,
      z: terrain.originZ + terrain.sizeZ / 2,
    },
    // Rapier counts cells. The buffer counts vertices, so each axis is one shorter.
    rows: terrain.rows - 1,
    cols: terrain.cols - 1,
    heights: city.physicsHeights,
    scale: { x: terrain.sizeX, y: 1, z: terrain.sizeZ },
  });
  ctx.renderer.addMesh({
    kind: 'box',
    size: { x: city.water.sx, y: 0.6, z: city.water.sz },
    color: 0x0e8fbe,
    position: { x: city.water.x, y: city.water.y, z: city.water.z },
    roughness: 0.05,
    metalness: 0.82,
    surface: 'water',
  });
  for (const mesh of city.meshes) {
    const list = byChunk.get(mesh.chunk);
    if (list) list.push(mesh);
    else byChunk.set(mesh.chunk, [mesh]);
  }
  ensureChunk(ctx, -1);
  show(ctx, -1, 'near');
}

/** Creates and shows chunks around a point. Returns how many chunks were created. */
export function streamAround(ctx: GameContext, x: number, z: number, budget: number): number {
  if (!bound) return 0;
  const here = chunkIndex(x, z);
  const hx = here % 64;
  const hz = Math.floor(here / 64);
  let created = 0;
  for (const id of byChunk.keys()) {
    if (id < 0) continue;
    const distance = Math.max(Math.abs((id % 64) - hx), Math.abs(Math.floor(id / 64) - hz));
    const mode = distance <= 1 ? 'near' : distance === 2 ? 'far' : 'off';
    const existing = live.get(id);
    if (!existing && mode === 'off') continue;
    if (!existing) {
      if (created >= budget) continue;
      ensureChunk(ctx, id);
      created += 1;
    }
    show(ctx, id, mode);
  }
  let shown = 0;
  for (const item of live.values()) if (item.mode !== 'off') shown += 1;
  ctx.debug.chunks = shown;
  return created;
}

export function activeChunkCount(): number {
  let count = 0;
  for (const item of live.values()) if (item.mode !== 'off') count += 1;
  return count;
}

function ensureChunk(ctx: GameContext, id: number): void {
  if (live.has(id) || !bound) return;
  const record: LiveChunk = {
    meshIds: [],
    bodyIds: [],
    shellIds: [],
    near: [],
    far: [],
    always: [],
    mode: 'off',
  };
  for (const mesh of byChunk.get(id) ?? []) {
    const meshId = mesh.model
      ? ctx.renderer.addModelInstances({
          url: mesh.model,
          count: mesh.count,
          matrices: mesh.matrices,
          ...(PAINTED_MODELS.has(mesh.model) ? { paint: mesh.colors } : {}),
          castShadow: mesh.castShadow,
        })
      : addBoxes(ctx, mesh);
    record.meshIds.push(meshId);
    if (mesh.lod === 'near') record.near.push(meshId);
    else if (mesh.lod === 'far') record.far.push(meshId);
    else record.always.push(meshId);
    ctx.renderer.setMeshVisible(meshId, false);
  }
  for (const box of [...bound.colliders, ...bound.streetProps]) {
    if (box.chunk !== id) continue;
    quatFromYawPitch(box.yaw, box.pitch, yawScratch);
    record.bodyIds.push(
      ctx.physics.createStaticBox({
        position: { x: box.x, y: box.y, z: box.z },
        halfExtents: { x: box.hx, y: box.hy, z: box.hz },
        rotation: { x: yawScratch.x, y: yawScratch.y, z: yawScratch.z, w: yawScratch.w },
      }),
    );
    record.shellIds.push(
      ctx.renderer.addMesh({
        kind: 'box',
        size: { x: box.hx * 2, y: box.hy * 2, z: box.hz * 2 },
        color: 0x39ffe1,
        position: { x: box.x, y: box.y, z: box.z },
        rotation: { x: yawScratch.x, y: yawScratch.y, z: yawScratch.z, w: yawScratch.w },
        wireframe: true,
      }),
    );
  }
  live.set(id, record);
}

function show(ctx: GameContext, id: number, mode: 'near' | 'far' | 'off'): void {
  const record = live.get(id);
  if (!record || record.mode === mode) return;
  record.mode = mode;
  const near = mode === 'near';
  const far = mode === 'far';
  for (const meshId of record.near) ctx.renderer.setMeshVisible(meshId, near);
  for (const meshId of record.far) ctx.renderer.setMeshVisible(meshId, far);
  for (const meshId of record.always) ctx.renderer.setMeshVisible(meshId, mode !== 'off');
  const solid = mode !== 'off';
  for (const bodyId of record.bodyIds) ctx.physics.setBodyEnabled(bodyId, solid);
  for (const meshId of record.shellIds) {
    ctx.renderer.setMeshVisible(meshId, solid && ctx.debug.showColliders);
  }
}

/** Shows or hides the building volumes already loaded around the player. */
export function syncBuildingShells(ctx: GameContext): void {
  for (const record of live.values()) {
    const solid = record.mode !== 'off';
    for (const meshId of record.shellIds) {
      ctx.renderer.setMeshVisible(meshId, solid && ctx.debug.showColliders);
    }
  }
}

function addBoxes(ctx: GameContext, mesh: CityMesh): number {
  return ctx.renderer.addInstances({
    kind: mesh.kind === 'cylinder' ? 'cylinder' : 'box',
    size: { x: 1, y: 1, z: 1 },
    color: 0xffffff,
    count: mesh.count,
    matrices: mesh.matrices,
    colors: mesh.colors,
    unit: true,
    roughness: mesh.roughness,
    metalness: mesh.metalness,
    emissive: mesh.emissive,
    castShadow: mesh.castShadow,
    ...(mesh.finish === 'flat' ? {} : { finish: mesh.finish }),
    ...(mesh.facade ? { facade: mesh.facade } : {}),
  });
}
