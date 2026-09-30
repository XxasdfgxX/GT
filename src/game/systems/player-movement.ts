/** On-foot locomotion. Planar speed follows the body facing; jump is one impulse per press. */

import { hasComponent, type World } from 'bitecs';
import { quatFromYaw, type Quat, type Vec3 } from '../../engine/core/math';
import type { GameContext } from '../../engine/core/context';
import { sampleHeight } from '../../content/map/island-shape';
import { sim } from '../../content/sim';
import { BUMP_SPEED, BODY_REACH, TRIP_SECONDS, circlesOverlap } from '../play/overlap';
import { punchProfile } from './ped-ai';
import { InputState, PhysicsRef, Player, Transform, Velocity } from '../ecs/components';
import { players } from '../ecs/queries';

export const Mode = {
  OnFoot: 0,
  Driving: 1,
  Boarding: 2,
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
    InputState.heavy[eid] = 0;
    Player.action[eid] = 0;
    Player.punchWindow[eid] = 0;
    Player.strike[eid] = 0;
    return;
  }
  if ((Player.trip[eid] ?? 0) > 0) {
    Player.trip[eid] = Math.max(0, (Player.trip[eid] ?? 0) - dt);
    Velocity.x[eid] = 0;
    Velocity.z[eid] = 0;
    InputState.jump[eid] = 0;
    InputState.punch[eid] = 0;
    InputState.heavy[eid] = 0;
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

  let vertical = (Velocity.y[eid] ?? 0) + gravity * dt;
  if (grounded && vertical < 0) vertical = 0;
  if (InputState.jump[eid] && grounded) vertical = Player.jumpSpeed[eid] ?? 0;
  InputState.jump[eid] = 0;
  const punching = InputState.punch[eid] === 1;
  if (punching && (Player.action[eid] ?? 0) <= 0) {
    const profile = punchProfile(InputState.heavy[eid] === 1);
    Player.action[eid] = profile.duration;
    Player.punchPower[eid] = profile.damage;
    Player.punchWindow[eid] = profile.hitDelay;
    Player.punchSerial[eid] = (Player.punchSerial[eid] ?? 0) + 1;
  } else {
    Player.action[eid] = Math.max(0, (Player.action[eid] ?? 0) - dt);
  }
  const windowLeft = Player.punchWindow[eid] ?? 0;
  if (windowLeft > 0) {
    const next = windowLeft - dt;
    Player.punchWindow[eid] = Math.max(0, next);
    if (next <= 0) Player.strike[eid] = 1;
  }
  InputState.punch[eid] = 0;
  InputState.heavy[eid] = 0;
  Velocity.y[eid] = vertical;
}

const delta: Vec3 = { x: 0, y: 0, z: 0 };
const pose: Vec3 = { x: 0, y: 0, z: 0 };
const poseRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
const facing: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** Capsule center with the feet on the terrain. The drawn street sits just above this. */
export function capsuleFloor(x: number, z: number): number {
  return sampleHeight(x, z) + sim.playerRadius + sim.playerHalfHeight;
}

export function playerMovementSystem(ctx: GameContext, world: World): void {
  const dt = ctx.time.fixedDt;
  for (const eid of players(world)) {
    const body = PhysicsRef.body[eid] ?? 0;
    if (body === 0) continue;
    if ((Player.health[eid] ?? 0) <= 0) {
      Velocity.x[eid] = 0;
      Velocity.y[eid] = 0;
      Velocity.z[eid] = 0;
      continue;
    }
    applyLocomotion(
      world,
      eid,
      Player.facing[eid] ?? 0,
      sim.gravity,
      dt,
      ctx.physics.isGrounded(body),
    );
    if (Player.mode[eid] !== Mode.OnFoot) continue;
    const speed = Math.hypot(Velocity.x[eid] ?? 0, Velocity.z[eid] ?? 0);
    delta.x = (Velocity.x[eid] ?? 0) * dt;
    delta.y = (Velocity.y[eid] ?? 0) * dt;
    delta.z = (Velocity.z[eid] ?? 0) * dt;
    ctx.physics.moveCharacter(body, delta);
    ctx.physics.getTransform(body, pose, poseRot);
    const lifted = ctx.physics.raiseCharacter(
      body,
      capsuleFloor(pose.x + delta.x, pose.z + delta.z),
    );
    if (lifted && (Velocity.y[eid] ?? 0) < 0) Velocity.y[eid] = 0;
    if (ctx.physics.wasBlocked(body) && speed > BUMP_SPEED && (Player.trip[eid] ?? 0) <= 0) {
      Player.trip[eid] = TRIP_SECONDS;
      Velocity.x[eid] = 0;
      Velocity.z[eid] = 0;
    }
    if (ctx.physics.isGrounded(body) && (Velocity.y[eid] ?? 0) < 0) Velocity.y[eid] = 0;
  }
}

const peerPos: Vec3 = { x: 0, y: 0, z: 0 };
const peerRot: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** Keeps the local body outside other players. The one who gets hit falls on the server. */
export function separateFromPeers(ctx: GameContext, world: World): void {
  const peers = ctx.net?.state()?.players ?? [];
  const crowd = ctx.net?.state()?.npcs ?? [];
  if (peers.length === 0 && crowd.length === 0) return;
  for (const eid of players(world)) {
    if (Player.mode[eid] !== Mode.OnFoot) continue;
    const body = PhysicsRef.body[eid] ?? 0;
    if (body === 0) continue;
    ctx.physics.getTransform(body, peerPos, peerRot);
    for (const other of peers) {
      if (other.car !== 0) continue;
      pushOut(ctx, body, other.x, other.z);
    }
    for (const npc of crowd) {
      pushOut(ctx, body, npc.x, npc.z);
    }
  }
}

function pushOut(ctx: GameContext, body: number, x: number, z: number): void {
  if (!circlesOverlap(peerPos.x, peerPos.z, x, z, BODY_REACH)) return;
  const dx = peerPos.x - x;
  const dz = peerPos.z - z;
  const dist = Math.hypot(dx, dz) || 0.001;
  const gap = BODY_REACH - dist;
  if (gap <= 0) return;
  peerPos.x += (dx / dist) * gap;
  peerPos.z += (dz / dist) * gap;
  ctx.physics.setTransform(body, peerPos, peerRot);
}

export function applyPlayerFacing(world: World): void {
  for (const eid of players(world)) {
    const mode = Player.mode[eid];
    if (mode !== Mode.OnFoot && mode !== Mode.Boarding) continue;
    quatFromYaw(Player.facing[eid] ?? 0, facing);
    Transform.qx[eid] = facing.x;
    Transform.qy[eid] = facing.y;
    Transform.qz[eid] = facing.z;
    Transform.qw[eid] = facing.w;
  }
}
