/** On foot the middle mouse orbits. In a car the rig locks behind the nose, like a chase cam. */

import type { World } from 'bitecs';
import { lerp, slerpQuat, type Quat, type Vec3 } from '../../engine/core/math';
import type { GameContext } from '../context';
import { sampleHeight } from '../../content/map/island-shape';
import { STREET_LIFT } from '../../content/map/road-mesh';
import { sim } from '../../content/sim';
import { CameraRig, InputState, Player, Transform, Mode } from '../ecs/components';
import { players } from '../ecs/queries';
import { chaseCameraYaw, yawFromQuat } from '../play/heading';

/** Meters of air between the lens and the asphalt, past the near plane. */
const CAMERA_CLEARANCE = STREET_LIFT + 0.55;

const cameraPos: Vec3 = { x: 0, y: 0, z: 0 };
const lookAt: Vec3 = { x: 0, y: 0, z: 0 };
const fromRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
const toRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
const blendedRot: Quat = { x: 0, y: 0, z: 0, w: 1 };

export function dampAngle(current: number, target: number, blend: number): number {
  return current + shortestAngleDelta(current, target) * blend;
}

function shortestAngleDelta(from: number, to: number): number {
  const tau = Math.PI * 2;
  let delta = (to - from) % tau;
  if (delta > Math.PI) delta -= tau;
  if (delta < -Math.PI) delta += tau;
  return delta;
}

/** Lifts a point that slipped under the drawn street. */
export function aboveStreet(x: number, y: number, z: number): number {
  return Math.max(y, sampleHeight(x, z) + CAMERA_CLEARANCE);
}

export function updateCameraLook(ctx: GameContext, world: World): void {
  const locked = ctx.input.pointerLocked;
  const sensitivity = ctx.look.mouseSensitivity;
  for (const eid of players(world)) {
    applyZoom(eid, InputState.zoom[eid] ?? 0, Player.mode[eid] === Mode.Driving);
    if (!locked) continue;
    const lookX = InputState.lookX[eid] ?? 0;
    const lookY = InputState.lookY[eid] ?? 0;
    const pitch = (CameraRig.pitch[eid] ?? 0) + lookY * sensitivity;
    CameraRig.pitch[eid] = Math.min(sim.pitchMax, Math.max(sim.pitchMin, pitch));
    if (Player.mode[eid] === Mode.Driving) {
      const offset = (CameraRig.lookOffset[eid] ?? 0) - lookX * sensitivity;
      CameraRig.lookOffset[eid] = Math.max(
        -sim.cameraLookLimit,
        Math.min(sim.cameraLookLimit, offset),
      );
      continue;
    }
    CameraRig.lookOffset[eid] = 0;
    CameraRig.yaw[eid] = (CameraRig.yaw[eid] ?? 0) - lookX * sensitivity;
  }
}

export function placeCamera(ctx: GameContext, world: World, frameDt: number): void {
  const alpha = ctx.time.alpha;
  for (const eid of players(world)) {
    const driving = Player.mode[eid] === Mode.Driving;
    const target = driving ? (Player.vehicle[eid] ?? eid) : eid;
    if (driving) lockChaseYaw(eid, target, alpha, frameDt);
    const tx = lerp(Transform.ppx[target] ?? 0, Transform.px[target] ?? 0, alpha);
    const ty = lerp(Transform.ppy[target] ?? 0, Transform.py[target] ?? 0, alpha);
    const tz = lerp(Transform.ppz[target] ?? 0, Transform.pz[target] ?? 0, alpha);
    const yaw = CameraRig.yaw[eid] ?? 0;
    const pitch = CameraRig.pitch[eid] ?? 0;
    const distance = CameraRig.distance[eid] ?? sim.cameraDistanceFoot;
    const pivot = CameraRig.pivot[eid] ?? sim.cameraPivotFoot;
    const horizontal = Math.cos(pitch);
    const desiredX = tx + Math.sin(yaw) * horizontal * distance;
    const desiredZ = tz + Math.cos(yaw) * horizontal * distance;
    const desiredY = aboveStreet(desiredX, ty + pivot + Math.sin(pitch) * distance, desiredZ);
    if ((CameraRig.ready[eid] ?? 0) === 0) {
      CameraRig.x[eid] = desiredX;
      CameraRig.y[eid] = desiredY;
      CameraRig.z[eid] = desiredZ;
      CameraRig.ready[eid] = 1;
    } else {
      const blend = 1 - Math.exp(-sim.cameraSmooth * frameDt);
      CameraRig.x[eid] = (CameraRig.x[eid] ?? 0) + (desiredX - (CameraRig.x[eid] ?? 0)) * blend;
      CameraRig.y[eid] = (CameraRig.y[eid] ?? 0) + (desiredY - (CameraRig.y[eid] ?? 0)) * blend;
      CameraRig.z[eid] = (CameraRig.z[eid] ?? 0) + (desiredZ - (CameraRig.z[eid] ?? 0)) * blend;
    }
    CameraRig.y[eid] = aboveStreet(
      CameraRig.x[eid] ?? 0,
      CameraRig.y[eid] ?? 0,
      CameraRig.z[eid] ?? 0,
    );
    cameraPos.x = CameraRig.x[eid] ?? 0;
    cameraPos.y = CameraRig.y[eid] ?? 0;
    cameraPos.z = CameraRig.z[eid] ?? 0;
    lookAt.x = tx;
    lookAt.y = ty + pivot * 0.55;
    lookAt.z = tz;
    ctx.renderer.setCamera(cameraPos, lookAt);
  }
}

function applyZoom(eid: number, zoom: number, driving: boolean): void {
  if (zoom === 0) return;
  const min = driving ? sim.cameraDistanceCarMin : sim.cameraDistanceFootMin;
  const max = driving ? sim.cameraDistanceCarMax : sim.cameraDistanceFootMax;
  const current =
    CameraRig.distance[eid] ?? (driving ? sim.cameraDistanceCar : sim.cameraDistanceFoot);
  const step = Math.max(-160, Math.min(160, zoom)) * sim.zoomSpeed;
  CameraRig.distance[eid] = Math.min(max, Math.max(min, current + step));
}

function lockChaseYaw(eid: number, target: number, alpha: number, frameDt: number): void {
  fromRot.x = Transform.pqx[target] ?? 0;
  fromRot.y = Transform.pqy[target] ?? 0;
  fromRot.z = Transform.pqz[target] ?? 0;
  fromRot.w = Transform.pqw[target] ?? 1;
  toRot.x = Transform.qx[target] ?? 0;
  toRot.y = Transform.qy[target] ?? 0;
  toRot.z = Transform.qz[target] ?? 0;
  toRot.w = Transform.qw[target] ?? 1;
  slerpQuat(fromRot, toRot, alpha, blendedRot);
  const offset = CameraRig.lookOffset[eid] ?? 0;
  const locked = chaseCameraYaw(yawFromQuat(blendedRot)) + offset;
  if ((CameraRig.ready[eid] ?? 0) === 0) CameraRig.yaw[eid] = locked;
  else {
    const blend = 1 - Math.exp(-sim.cameraChase * frameDt);
    CameraRig.yaw[eid] = dampAngle(CameraRig.yaw[eid] ?? locked, locked, blend);
  }
  CameraRig.lookOffset[eid] = offset * Math.exp(-sim.cameraLookReturn * frameDt);
}
