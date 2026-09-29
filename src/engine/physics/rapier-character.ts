/** Kinematic capsule and Rapier's character controller. */

import RAPIER from '@dimforge/rapier3d-compat';
import type {
  Collider,
  KinematicCharacterController,
  RigidBody,
  World,
} from '@dimforge/rapier3d-compat';
import type { Vec3 } from '../core/math';
import { Groups } from './layers';
import type { CharacterDesc } from './physics-world';

export interface CharacterRecord {
  body: RigidBody;
  collider: Collider;
  controller: KinematicCharacterController;
  grounded: boolean;
}

export interface MoveScratch {
  delta: RAPIER.Vector3;
  movement: RAPIER.Vector3;
  translation: RAPIER.Vector3;
  next: RAPIER.Vector3;
}

export function attachCharacter(world: World, desc: CharacterDesc): CharacterRecord {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(desc.position.x, desc.position.y, desc.position.z)
      .lockRotations(),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(desc.halfHeight, desc.radius)
      .setFriction(0)
      .setCollisionGroups(Groups.player),
    body,
  );
  const controller = world.createCharacterController(0.05);
  controller.enableSnapToGround(0.25);
  controller.enableAutostep(0.3, 0.2, false);
  controller.setSlideEnabled(true);
  controller.setApplyImpulsesToDynamicBodies(false);
  controller.setMaxSlopeClimbAngle(Math.PI * 0.3);
  return { body, collider, controller, grounded: false };
}

export function moveCharacter(record: CharacterRecord, delta: Vec3, scratch: MoveScratch): void {
  if (!record.body.isEnabled()) return;
  if (delta.y > 0.001) record.controller.disableSnapToGround();
  else record.controller.enableSnapToGround(0.25);
  scratch.delta.x = delta.x;
  scratch.delta.y = delta.y;
  scratch.delta.z = delta.z;
  record.controller.computeColliderMovement(
    record.collider,
    scratch.delta,
    undefined,
    Groups.player,
  );
  const movement = record.controller.computedMovement(scratch.movement);
  const translation = record.body.translation(scratch.translation);
  const maxUp = Math.max(delta.y, 0) + 0.35;
  const rise = Math.min(movement.y, maxUp);
  scratch.next.x = translation.x + movement.x;
  scratch.next.y = translation.y + rise;
  scratch.next.z = translation.z + movement.z;
  record.body.setNextKinematicTranslation(scratch.next);
  record.grounded = record.controller.computedGrounded();
}
