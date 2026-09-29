/** On-foot locomotion. Planar speed is camera-relative; jump is one impulse per press. */

import { hasComponent, type World } from 'bitecs';
import { quatFromYaw, type Quat, type Vec3 } from '../../engine/core/math';
import type { GameContext } from '../../engine/core/context';
import { sim } from '../../content/sim';
import { stepAction } from '../play/animate';
import { CameraRig, InputState, PhysicsRef, Player, Transform, Velocity } from '../ecs/components';
import { players } from '../ecs/queries';

export const Mode = {
  OnFoot: 0,
  Driving: 1,
} as const;

export interface Planar {
  x: number;
  z: number;
}

const planarScratch: Planar = { x: 0, z: 0 };

export function computePlanarVelocity(
  moveX: number,
  moveZ: number,
  yaw: number,
  speed: number,
  out: Planar = planarScratch,
): Planar {
  const length = Math.hypot(moveX, moveZ);
  if (length < 1e-5) {
    out.x = 0;
    out.z = 0;
    return out;
  }
  const ix = moveX / length;
  const iz = moveZ / length;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  out.x = (-sin * iz + cos * ix) * speed;
  out.z = (-cos * iz + -sin * ix) * speed;
  return out;
}

export function applyLocomotion(
  world: World,
  eid: number,
  yaw: number,
  gravity: number,
  dt: number,
  grounded: boolean,
): void {
  if (!hasComponent(world, eid, Player)) return;
  if (Player.mode[eid] !== Mode.OnFoot) {
    InputState.jump[eid] = 0;
    InputState.punch[eid] = 0;
    Player.action[eid] = 0;
    return;
  }
  const speed = InputState.sprint[eid] ? Player.sprintSpeed[eid] : Player.speed[eid];
  const planar = computePlanarVelocity(
    InputState.moveX[eid] ?? 0,
    InputState.moveZ[eid] ?? 0,
    yaw,
    speed ?? 0,
  );
  Velocity.x[eid] = planar.x;
  Velocity.z[eid] = planar.z;
  // The mesh adds half a turn, so the X sign is flipped to face the way it walks.
  if (planar.x !== 0 || planar.z !== 0) Player.facing[eid] = Math.atan2(-planar.x, -planar.z);

  let vertical = (Velocity.y[eid] ?? 0) + gravity * dt;
  if (grounded && vertical < 0) vertical = 0;
  if (InputState.jump[eid] && grounded) vertical = Player.jumpSpeed[eid] ?? 0;
  InputState.jump[eid] = 0;
  const punching = InputState.punch[eid] === 1;
  if (punching) Player.punchSerial[eid] = (Player.punchSerial[eid] ?? 0) + 1;
  Player.action[eid] = stepAction(Player.action[eid] ?? 0, punching, dt, sim.punchDuration);
  InputState.punch[eid] = 0;
  Velocity.y[eid] = vertical;
}

const delta: Vec3 = { x: 0, y: 0, z: 0 };
const facing: Quat = { x: 0, y: 0, z: 0, w: 1 };

export function playerMovementSystem(ctx: GameContext, world: World): void {
  const dt = ctx.time.fixedDt;
  for (const eid of players(world)) {
    const body = PhysicsRef.body[eid] ?? 0;
    if (body === 0) continue;
    applyLocomotion(
      world,
      eid,
      CameraRig.yaw[eid] ?? 0,
      sim.gravity,
      dt,
      ctx.physics.isGrounded(body),
    );
    if (Player.mode[eid] !== Mode.OnFoot) continue;
    delta.x = (Velocity.x[eid] ?? 0) * dt;
    delta.y = (Velocity.y[eid] ?? 0) * dt;
    delta.z = (Velocity.z[eid] ?? 0) * dt;
    ctx.physics.moveCharacter(body, delta);
    if (ctx.physics.isGrounded(body) && (Velocity.y[eid] ?? 0) < 0) Velocity.y[eid] = 0;
  }
}

export function applyPlayerFacing(world: World): void {
  for (const eid of players(world)) {
    if (Player.mode[eid] !== Mode.OnFoot) continue;
    quatFromYaw(Player.facing[eid] ?? 0, facing);
    Transform.qx[eid] = facing.x;
    Transform.qy[eid] = facing.y;
    Transform.qz[eid] = facing.z;
    Transform.qw[eid] = facing.w;
  }
}
