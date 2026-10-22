/** A traffic car the player hit or stole: free driving on its own heading. */

import { stepDrivenSpeed } from '../../content/cars';
import { sampleHeight } from '../../content/map/island-shape';
import { trafficCatalog } from '../../content/traffic-catalog';
import { sedan } from '../../content/vehicles';
import { quatFromYaw } from '../../engine/core/math';
import type { GameContext } from '../context';
import { InputState, PhysicsRef, Player, Traffic, Transform, Vehicle } from '../ecs/components';
import { players } from '../ecs/queries';
import { enginePlayback } from '../play/feel';
import type { World } from 'bitecs';
import { pos, rot, yawOf } from './traffic';
import { drivenYawRate } from '../../sim/traffic-ai';
import { deepestExit, obstruction, slideOut } from './traffic-unstick';

export function driveStolen(ctx: GameContext, world: World, eid: number, dt: number): void {
  const spec = trafficCatalog[Traffic.variant[eid] ?? 0];
  if (!spec) return;
  let throttle = 0;
  let brake = 0;
  let steer = 0;
  let handbrake = false;
  for (const player of players(world)) {
    if ((Player.vehicle[player] ?? 0) !== eid) continue;
    throttle = InputState.throttle[player] ?? 0;
    brake = InputState.brake[player] ?? 0;
    steer = InputState.steer[player] ?? 0;
    handbrake = InputState.handbrake[player] === 1;
    break;
  }
  let speed = stepDrivenSpeed(
    Traffic.speed[eid] ?? 0,
    { throttle, brake, handbrake },
    dt,
    spec.torque,
    spec.maxSpeedKmh,
  );
  Traffic.speed[eid] = speed;
  Vehicle.speed[eid] = speed;
  const yaw =
    yawOf(eid) +
    drivenYawRate(steer, speed, sedan.steerSign) *
      dt *
      (0.65 + Math.min(Math.abs(speed), spec.topSpeed) * 0.1);
  const prevX = Transform.px[eid] ?? 0;
  const prevZ = Transform.pz[eid] ?? 0;
  const hx = spec.width / 2;
  const hz = spec.length / 2;
  pos.x = prevX + Math.sin(yaw) * speed * dt;
  pos.z = prevZ + Math.cos(yaw) * speed * dt;
  const before = obstruction(world, eid, prevX, prevZ, yaw, hx, hz);
  const after = obstruction(world, eid, pos.x, pos.z, yaw, hx, hz);
  if (after > before + 0.001) {
    pos.x = prevX;
    pos.z = prevZ;
    speed = 0;
    Traffic.speed[eid] = 0;
    Vehicle.speed[eid] = 0;
    const push = deepestExit(world, eid, pos.x, pos.z, yaw, hx, hz);
    slideOut(pos, push.x, push.z);
  }
  const ground = sampleHeight(pos.x, pos.z);
  pos.y = ground + spec.height / 2;
  quatFromYaw(yaw, rot);
  ctx.physics.setTransform(PhysicsRef.body[eid] ?? 0, pos, rot);
  const tone = enginePlayback(true, speed, Math.abs(throttle));
  ctx.audio.setEngine(tone.frequency, tone.gain);
}
