/** Player poses: the reach budget, the height clamp, and steering a held car. */

import { sampleHeight } from '../../content/map/island-shape';
import { trafficCatalog } from '../../content/traffic-catalog';
import { BODY_REACH, pinsCircle, TRIP_SECONDS } from '../../game/play/overlap';
import { findCar, findPlayer } from './roster';
import {
  CAR_SPEED_MARGIN,
  FOOT_SPEED_LIMIT,
  type Guy,
  MAX_AIR,
  MAX_DIP,
  type Pose,
  REACH_BURST,
  type Room,
  SNAP_EXCESS,
} from './types';

export function pushPose(room: Room, id: number, pose: Pose): void {
  const player = findPlayer(room, id);
  if (!player?.alive) return;
  // A tripped body stays where it fell until it gets up.
  if (room.limits && player.down > 0) return;
  const previousX = player.x;
  const previousZ = player.z;
  const reach = room.limits ? spendReach(room, player, pose) : 1;
  player.x = previousX + (pose.x - previousX) * reach;
  player.z = previousZ + (pose.z - previousZ) * reach;
  player.y = room.limits ? groundedY(player.x, player.z, pose.y) : pose.y;
  player.yaw = pose.yaw;
  const moved = Math.hypot(player.x - previousX, player.z - previousZ);
  if (player.car === 0 && moved > 0.12) {
    for (const other of room.players) {
      if (other.id === id || !other.alive || other.car !== 0) continue;
      if (!pinsCircle(previousX, previousZ, player.x, player.z, other.x, other.z, BODY_REACH)) {
        continue;
      }
      if (other.down > 0) continue;
      player.x = previousX;
      player.z = previousZ;
      other.down = TRIP_SECONDS;
      break;
    }
    for (const npc of room.npcs) {
      if (!npc.alive || npc.down > 0) continue;
      if (!pinsCircle(previousX, previousZ, player.x, player.z, npc.x, npc.z, BODY_REACH)) continue;
      player.x = previousX;
      player.z = previousZ;
      npc.down = TRIP_SECONDS;
      break;
    }
  }
  steerCar(room, player);
}

/** Clamps a claimed height to the terrain. Hits test only x and z, so a body in the sky still hits. */
export function groundedY(x: number, z: number, y: number): number {
  const ground = sampleHeight(x, z);
  return Math.min(ground + MAX_AIR, Math.max(ground - MAX_DIP, y));
}

/**
 * Share of the claimed move this player may make, 0 to 1. The budget refills at top
 * speed and holds REACH_BURST seconds of it, so sending poses faster buys no distance.
 */
export function spendReach(room: Room, player: Guy, pose: Pose): number {
  const limit = speedLimit(room, player);
  player.reach = Math.min(
    limit * REACH_BURST,
    player.reach + limit * Math.max(0, room.now - player.reachAt),
  );
  player.reachAt = room.now;
  const claimed = Math.hypot(pose.x - player.x, pose.z - player.z);
  if (claimed <= player.reach) {
    player.reach -= claimed;
    return 1;
  }
  const share = player.reach / claimed;
  // A client this far off is cheating or badly out of sync: move it back on screen.
  if (claimed - player.reach > SNAP_EXCESS && player.car === 0) {
    player.placeSerial += 1;
    player.place = {
      x: player.x + (pose.x - player.x) * share,
      y: player.y,
      z: player.z + (pose.z - player.z) * share,
    };
  }
  player.reach = 0;
  return share;
}

export function speedLimit(room: Room, player: Guy): number {
  if (player.car === 0) return FOOT_SPEED_LIMIT;
  const car = findCar(room, player.car);
  const spec = car ? trafficCatalog[car.variant] : undefined;
  return ((spec?.maxSpeedKmh ?? 150) / 3.6) * CAR_SPEED_MARGIN;
}

export function steerCar(room: Room, player: Guy): void {
  if (player.car === 0) return;
  const car = findCar(room, player.car);
  if (!car || car.driver !== player.id) return;
  car.x = player.x;
  car.y = player.y;
  car.z = player.z;
  car.yaw = player.yaw;
}
