/** Fixed pool of kinematic traffic cars. Inactive bodies stay disabled. */

import { addComponent, addEntity, type World } from 'bitecs';
import { STREET_LIFT } from '../../../content/map/road-mesh';
import { trafficCatalog } from '../../../content/traffic-catalog';
import type { GameContext } from '../../context';
import { quatFromYaw } from '../../../engine/core/math';
import { PhysicsRef, RenderRef, Traffic, Transform, writePose } from '../../ecs/components';

const yaw = { x: 0, y: 0, z: 0, w: 1 };
const shells = new Map<number, number>();

export const TRAFFIC_POOL = 40;

export function spawnTrafficPool(ctx: GameContext, world: World): void {
  shells.clear();
  quatFromYaw(0, yaw);
  for (let i = 0; i < TRAFFIC_POOL; i += 1) {
    const spec = trafficCatalog[i % trafficCatalog.length];
    if (!spec) continue;
    const eid = addEntity(world);
    addComponent(world, eid, Traffic);
    addComponent(world, eid, Transform);
    addComponent(world, eid, PhysicsRef);
    addComponent(world, eid, RenderRef);
    writePose(eid, 0, -20, 0);
    Traffic.active[eid] = 0;
    Traffic.mode[eid] = 0;
    Traffic.variant[eid] = i % trafficCatalog.length;
    Traffic.edge[eid] = 0;
    Traffic.lane[eid] = 0;
    Traffic.dir[eid] = 0;
    Traffic.along[eid] = 0;
    Traffic.speed[eid] = 0;
    PhysicsRef.body[eid] = ctx.physics.createKinematicBox({
      position: { x: 0, y: -20, z: 0 },
      halfExtents: { x: spec.width / 2, y: spec.height / 2, z: spec.length / 2 },
    });
    ctx.physics.setBodyEnabled(PhysicsRef.body[eid] ?? 0, false);
    RenderRef.mesh[eid] = ctx.renderer.addModel({
      url: spec.url,
      position: { x: 0, y: -20, z: 0 },
      rotation: yaw,
      scale: spec.scale,
      // The mesh origin is the tires. The body center sits at height/2, so the
      // offset drops the tires onto the asphalt instead of burying the cabin.
      offset: { x: 0, y: STREET_LIFT - spec.height / 2, z: 0 },
      tint: spec.color,
    });
    const shell = ctx.renderer.addMesh({
      kind: 'box',
      size: { x: spec.width, y: spec.height, z: spec.length },
      color: 0xffc857,
      position: { x: 0, y: 0, z: 0 },
      parent: RenderRef.mesh[eid],
      wireframe: true,
    });
    shells.set(eid, shell);
    ctx.renderer.setMeshVisible(shell, false);
    ctx.renderer.setMeshVisible(RenderRef.mesh[eid] ?? 0, false);
  }
}

/** Amber boxes follow the admin volume switch. A hidden car stays hidden. */
export function syncTrafficShells(ctx: GameContext): void {
  for (const shell of shells.values()) {
    ctx.renderer.setMeshVisible(shell, ctx.debug.showColliders);
  }
}
