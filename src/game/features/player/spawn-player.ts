/** Spawns the on-foot capsule a short walk from the car. */

import { addComponent, addEntity, type World } from 'bitecs';
import type { GameContext } from '../../../engine/core/context';
import { sampleHeight } from '../../../content/map/island-shape';
import { STREET_LIFT } from '../../../content/map/road-mesh';
import {
  characterAlignYaw,
  characterClips,
  characterModel,
  characterScale,
} from '../../../content/models';
import { sim } from '../../../content/sim';
import {
  CameraRig,
  InputState,
  PhysicsRef,
  Player,
  RenderRef,
  Transform,
  Velocity,
  writePose,
} from '../../ecs/components';
import { Mode } from '../../systems/player-movement';

export function spawnPlayer(ctx: GameContext, world: World): number {
  const eid = addEntity(world);
  addComponent(world, eid, Player);
  addComponent(world, eid, Transform);
  addComponent(world, eid, Velocity);
  addComponent(world, eid, InputState);
  addComponent(world, eid, PhysicsRef);
  addComponent(world, eid, RenderRef);
  addComponent(world, eid, CameraRig);

  const x = 0;
  const z = 12;
  const y = sampleHeight(x, z) + sim.playerRadius + sim.playerHalfHeight;
  writePose(eid, x, y, z);
  Player.mode[eid] = Mode.OnFoot;
  Player.speed[eid] = sim.walkSpeed;
  Player.sprintSpeed[eid] = sim.sprintSpeed;
  Player.jumpSpeed[eid] = sim.jumpSpeed;
  Player.health[eid] = sim.maxHealth;
  CameraRig.yaw[eid] = Math.PI;
  CameraRig.pitch[eid] = 0.28;
  CameraRig.distance[eid] = sim.cameraDistanceFoot;
  CameraRig.pivot[eid] = sim.cameraPivotFoot;

  PhysicsRef.body[eid] = ctx.physics.createCharacter({
    position: { x, y, z },
    radius: sim.playerRadius,
    halfHeight: sim.playerHalfHeight,
  });
  RenderRef.mesh[eid] = ctx.renderer.addModel({
    url: characterModel,
    position: { x, y, z },
    scale: characterScale,
    offset: { x: 0, y: -(sim.playerRadius + sim.playerHalfHeight) + STREET_LIFT, z: 0 },
    alignYaw: characterAlignYaw,
    clips: characterClips,
  });
  return eid;
}
