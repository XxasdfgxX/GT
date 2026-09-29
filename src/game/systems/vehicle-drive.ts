/** Throttle, brake, steer, and handbrake for the occupied vehicle. Reverse uses brake at low speed. */

import type { World } from 'bitecs';
import { sedan } from '../../content/vehicles';
import type { GameContext } from '../../engine/core/context';
import { enginePlayback } from '../play/feel';
import { InputState, PhysicsRef, Player, Vehicle } from '../ecs/components';
import { players, vehicles } from '../ecs/queries';
import { Mode } from './player-movement';

const coast = { throttle: 0, brake: 0, steer: 0, handbrake: false };

export function vehicleDriveSystem(ctx: GameContext, world: World): void {
  let driving = false;
  for (const eid of players(world)) {
    if (Player.mode[eid] !== Mode.Driving) continue;
    const vehicleEid = Player.vehicle[eid] ?? 0;
    const body = PhysicsRef.body[vehicleEid] ?? 0;
    if (body === 0) continue;
    driving = true;
    let throttle = InputState.throttle[eid] ?? 0;
    let brake = InputState.brake[eid] ?? 0;
    const speed = ctx.physics.forwardSpeed(body);
    Vehicle.speed[vehicleEid] = speed;
    if (brake > 0 && speed <= 0.4) {
      throttle = -brake;
      brake = 0;
    } else if (throttle > 0 && speed < -0.4) {
      brake = throttle;
      throttle = 0;
    }
    throttle = limitThrottle(throttle, speed);
    let steer = InputState.steer[eid] ?? 0;
    if (speed > 1) steer *= 1.85;
    const tone = enginePlayback(true, speed, Math.abs(throttle));
    ctx.audio.setEngine(tone.frequency, tone.gain);
    ctx.physics.setVehicleInput(body, {
      throttle,
      brake,
      steer,
      handbrake: InputState.handbrake[eid] === 1,
    });
  }

  if (!driving) {
    const quiet = enginePlayback(false, 0, 0);
    ctx.audio.setEngine(quiet.frequency, quiet.gain);
  }

  for (const vehicleEid of vehicles(world)) {
    if (Vehicle.occupied[vehicleEid] === 1) continue;
    const body = PhysicsRef.body[vehicleEid] ?? 0;
    if (body === 0) continue;
    ctx.physics.setVehicleInput(body, coast);
  }
}

function limitThrottle(throttle: number, speed: number): number {
  if (throttle > 0) {
    const cap = sedan.maxForwardSpeed;
    if (speed >= cap) return 0;
    const fade = cap * 0.82;
    if (speed > fade) return throttle * ((cap - speed) / (cap - fade));
  }
  if (throttle < 0 && speed <= -sedan.maxReverseSpeed) return 0;
  return throttle;
}
