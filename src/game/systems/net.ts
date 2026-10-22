/** Sends the local pose and applies the server's health, cash, and respawn. */

import type { World } from 'bitecs';
import type { GameContext } from '../../engine/core/context';
import { Player, Transform } from '../ecs/components';
import { players } from '../ecs/queries';
import { hideBody, showBody } from '../features/player/place-player';
import { PICKUP_REACH } from '../play/wallet';
import { yawFromQuat } from './camera-follow';
import { HEAVY_DAMAGE } from './ped-ai';
import { Mode } from './player-movement';

const POSE_INTERVAL = 1 / 15;
let poseWait = 0;

export function resetNet(): void {
  poseWait = 0;
}

export function applyNetState(ctx: GameContext, world: World): void {
  const state = ctx.net?.state() ?? null;
  if (!state) return;
  for (const eid of players(world)) {
    if ((state.self.down ?? 0) > (Player.trip[eid] ?? 0)) Player.trip[eid] = state.self.down;
    Player.health[eid] = state.self.health;
    Player.cash[eid] = state.self.cash;
    if (!state.self.alive) {
      if ((Player.hidden[eid] ?? 0) === 0) hideBody(ctx, eid);
      continue;
    }
    if ((Player.placeSerial[eid] ?? 0) === state.self.placeSerial) continue;
    const place = state.self.place;
    showBody(ctx, eid, place.x, place.y, place.z);
    Player.placeSerial[eid] = state.self.placeSerial;
  }
}

export function publishNet(ctx: GameContext, world: World): void {
  const net = ctx.net;
  if (!net) return;
  poseWait -= ctx.time.fixedDt;
  const sendPose = poseWait <= 0;
  if (sendPose) poseWait = POSE_INTERVAL;
  const state = net.state();
  for (const eid of players(world)) {
    const alive = (Player.health[eid] ?? 0) > 0;
    if (alive && (Player.strike[eid] ?? 0) === 1) {
      net.sendPunch({
        serial: Player.punchSerial[eid] ?? 1,
        heavy: (Player.punchPower[eid] ?? 0) >= HEAVY_DAMAGE,
        x: Transform.px[eid] ?? 0,
        y: Transform.py[eid] ?? 0,
        z: Transform.pz[eid] ?? 0,
        yaw: Player.facing[eid] ?? 0,
      });
    }
    Player.strike[eid] = 0;
    if (!alive || !sendPose) continue;
    const riding = Player.mode[eid] === Mode.Driving;
    const ride = riding ? (Player.vehicle[eid] ?? 0) : eid;
    const x = Transform.px[ride] ?? 0;
    const z = Transform.pz[ride] ?? 0;
    const yaw = riding
      ? yawFromQuat({
          x: Transform.qx[ride] ?? 0,
          y: Transform.qy[ride] ?? 0,
          z: Transform.qz[ride] ?? 0,
          w: Transform.qw[ride] ?? 1,
        })
      : (Player.facing[eid] ?? 0);
    net.sendPose({
      x,
      y: Transform.py[ride] ?? 0,
      z,
      yaw,
    });
    if (!state) continue;
    for (const drop of state.pickups) {
      if (Math.hypot(drop.x - x, drop.z - z) <= PICKUP_REACH) net.sendPickup(drop.id);
    }
  }
}
