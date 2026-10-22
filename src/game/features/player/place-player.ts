/** Hides or plants the local body. Solo death and server respawn both use this. */

import type { GameContext } from '../../context';
import { PhysicsRef, Player, RenderRef, Velocity, writePose } from '../../ecs/components';

const identity = { x: 0, y: 0, z: 0, w: 1 };

export function hideBody(ctx: GameContext, eid: number): void {
  const mesh = RenderRef.mesh[eid] ?? 0;
  if (mesh !== 0) ctx.renderer.setMeshVisible(mesh, false);
  const body = PhysicsRef.body[eid] ?? 0;
  if (body !== 0) ctx.physics.setBodyEnabled(body, false);
  Velocity.x[eid] = 0;
  Velocity.y[eid] = 0;
  Velocity.z[eid] = 0;
  Player.hidden[eid] = 1;
}

export function showBody(ctx: GameContext, eid: number, x: number, y: number, z: number): void {
  writePose(eid, x, y, z);
  const body = PhysicsRef.body[eid] ?? 0;
  if (body !== 0) {
    ctx.physics.setBodyEnabled(body, true);
    ctx.physics.setTransform(body, { x, y, z }, identity);
  }
  const mesh = RenderRef.mesh[eid] ?? 0;
  if (mesh !== 0) {
    ctx.renderer.setMeshVisible(mesh, true);
    ctx.renderer.setMeshTransform(mesh, { x, y, z }, identity);
  }
  Velocity.x[eid] = 0;
  Velocity.y[eid] = 0;
  Velocity.z[eid] = 0;
  Player.hidden[eid] = 0;
}
