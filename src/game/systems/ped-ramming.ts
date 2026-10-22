/** Cars running into walkers: knockdown and damage from the car's speed. */

import { carBody, carIds } from '../../content/cars';
import { trafficCatalog } from '../../content/traffic-catalog';
import type { GameContext } from '../context';
import { Pedestrian, Traffic, Transform, Vehicle } from '../ecs/components';
import { traffic } from '../ecs/queries';
import { crowdNear } from '../play/crowd-grid';
import { yawFromQuat } from '../play/heading';
import { circleHitsBox } from '../../sim/overlap';
import { hasComponent, type World } from 'bitecs';
import { applyDamage, HURT_SECONDS, PedState } from '../../sim/ped-ai';
import { carImpactDamage } from '../../sim/traffic-ai';

/** Same gap the room server keeps between two hits on one person. */
export const RAM_GAP = 0.6;

export const rideRot = { x: 0, y: 0, z: 0, w: 1 };

/**
 * The player's car hurts whoever its body runs into, on the damage curve the room
 * server uses, so a car is as dangerous offline as online.
 */
export function ramPedestrians(ctx: GameContext, world: World, ride: number, speed: number): void {
  const damage = carImpactDamage(speed);
  if (ride <= 0 || damage <= 0) return;
  let hx: number;
  let hz: number;
  if (hasComponent(world, ride, Traffic)) {
    const spec = trafficCatalog[Traffic.variant[ride] ?? 0];
    hx = (spec?.width ?? 1.8) / 2;
    hz = (spec?.length ?? 4.2) / 2;
  } else {
    const body = carBody(carIds[Vehicle.model[ride] ?? 0] ?? 'aston').halfExtents;
    hx = body.x;
    hz = body.z;
  }
  const x = Transform.px[ride] ?? 0;
  const z = Transform.pz[ride] ?? 0;
  rideRot.x = Transform.qx[ride] ?? 0;
  rideRot.y = Transform.qy[ride] ?? 0;
  rideRot.z = Transform.qz[ride] ?? 0;
  rideRot.w = Transform.qw[ride] ?? 1;
  const yaw = yawFromQuat(rideRot);
  for (const eid of crowdNear(x, z, Math.hypot(hx, hz) + 0.35)) {
    if ((Pedestrian.active[eid] ?? 0) === 0 || (Pedestrian.driving[eid] ?? 0) === 1) continue;
    if ((Pedestrian.health[eid] ?? 0) <= 0 || (Pedestrian.rammed[eid] ?? 0) > 0) continue;
    const px = Transform.px[eid] ?? 0;
    const pz = Transform.pz[eid] ?? 0;
    if (!circleHitsBox(px, pz, 0.35, x, z, hx, hz, yaw)) continue;
    Pedestrian.rammed[eid] = RAM_GAP;
    const health = applyDamage(Pedestrian.health[eid] ?? 10, damage);
    Pedestrian.health[eid] = health;
    Pedestrian.hurt[eid] = HURT_SECONDS;
    if (health <= 0) {
      Pedestrian.state[eid] = PedState.Down;
      Pedestrian.speed[eid] = 0;
    }
    ctx.events.emit('pedestrian:hit', { pedestrian: eid, speed });
  }
}

export function carClose(world: World, x: number, z: number): boolean {
  for (const eid of traffic(world)) {
    if ((Traffic.active[eid] ?? 0) === 0) continue;
    const dx = (Transform.px[eid] ?? 0) - x;
    const dz = (Transform.pz[eid] ?? 0) - z;
    if (dx * dx + dz * dz < 16 * 16) return true;
  }
  return false;
}
