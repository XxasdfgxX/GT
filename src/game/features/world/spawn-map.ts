/** Spawns Costa Verde: island, coast roads, houses, and the original street. */

import type { CostaVerde, CityCollider, CitySolid } from '../../../content/city';
import { island, testMap } from '../../../content/map';
import type { MapContent } from '../../../content/schemas';
import type { GameContext } from '../../../engine/core/context';
import { quatFromYaw, writeYawMatrix } from '../../../engine/core/math';
import { roadPieces } from './road';

const yawScratch = { x: 0, y: 0, z: 0, w: 1 };

export function spawnMap(ctx: GameContext, city: CostaVerde): void {
  const groundPos = { x: 0, y: -island.thickness / 2, z: island.centerZ };
  ctx.physics.createStaticBox({
    position: groundPos,
    halfExtents: { x: island.width / 2, y: island.thickness / 2, z: island.depth / 2 },
  });
  ctx.renderer.addMesh({
    kind: 'box',
    size: { x: island.width, y: island.thickness, z: island.depth },
    color: island.color,
    position: groundPos,
    roughness: 0.97,
    metalness: 0,
  });

  for (const item of city.solids) spawnSolid(ctx, item);
  for (const road of city.roads) spawnRoad(ctx, road);
  for (const batch of city.batches) {
    ctx.renderer.addInstances({
      kind: batch.kind,
      size: { x: batch.sx, y: batch.sy, z: batch.sz },
      color: batch.color,
      count: batch.count,
      matrices: batch.matrices,
      roughness: batch.roughness,
      metalness: batch.metalness,
      emissive: batch.emissive,
      castShadow: batch.castShadow,
    });
  }
  for (const box of city.colliders) spawnCollider(ctx, box);
  for (const box of city.bounds) spawnCollider(ctx, box);
  for (const building of [...testMap.buildings, ...city.houses]) {
    quatFromYaw(building.yaw, yawScratch);
    ctx.renderer.addModel({
      url: building.model,
      position: { x: building.x, y: 0, z: building.z },
      rotation: { x: yawScratch.x, y: yawScratch.y, z: yawScratch.z, w: yawScratch.w },
      scale: building.scale,
    });
    ctx.physics.createStaticBox({
      position: { x: building.x, y: building.sy / 2, z: building.z },
      halfExtents: { x: building.sx / 2, y: building.sy / 2, z: building.sz / 2 },
    });
  }
}

function spawnSolid(ctx: GameContext, item: CitySolid): void {
  ctx.renderer.addMesh({
    kind: 'box',
    size: { x: item.sx, y: item.sy, z: item.sz },
    color: item.color,
    position: { x: item.x, y: item.y, z: item.z },
    roughness: item.roughness,
    metalness: item.metalness,
    surface: item.surface,
  });
  if (!item.collide) return;
  spawnCollider(ctx, {
    x: item.x,
    y: item.y,
    z: item.z,
    hx: item.sx / 2,
    hy: item.sy / 2,
    hz: item.sz / 2,
  });
}

function spawnCollider(ctx: GameContext, box: CityCollider): void {
  ctx.physics.createStaticBox({
    position: { x: box.x, y: box.y, z: box.z },
    halfExtents: { x: box.hx, y: box.hy, z: box.hz },
  });
}

function spawnRoad(ctx: GameContext, road: MapContent['road']): void {
  const pieces = roadPieces(road);
  const lanes = pieces.filter((item) => item.role === 'lane');
  for (const item of pieces) {
    if (item.role === 'lane') continue;
    ctx.renderer.addMesh({
      kind: 'box',
      size: { x: item.sx, y: item.sy, z: item.sz },
      color: item.color,
      position: { x: item.x, y: item.y, z: item.z },
      roughness: item.role === 'asphalt' ? 0.94 : 0.82,
      metalness: 0,
    });
    if (!item.collide) continue;
    ctx.physics.createStaticBox({
      position: { x: item.x, y: item.y, z: item.z },
      halfExtents: { x: item.sx / 2, y: item.sy / 2, z: item.sz / 2 },
    });
  }
  const first = lanes[0];
  if (!first) return;
  const matrices = new Float32Array(lanes.length * 16);
  lanes.forEach((lane, index) => {
    writeYawMatrix(matrices, index, lane.x, lane.y, lane.z, 0);
  });
  ctx.renderer.addInstances({
    size: { x: first.sx, y: first.sy, z: first.sz },
    color: first.color,
    count: lanes.length,
    matrices,
    roughness: 0.55,
    metalness: 0,
    castShadow: false,
  });
}
