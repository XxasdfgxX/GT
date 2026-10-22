/** Throttle, brake, steer, and handbrake for the occupied vehicle. Reverse uses brake at low speed. */

import { hasComponent, type World } from 'bitecs';
import { sedan } from '../../content/vehicles';
import type { GameContext } from '../context';
import { enginePlayback } from '../play/feel';
import { InputState, PhysicsRef, Player, Traffic, Vehicle, Mode } from '../ecs/components';
import { players, vehicles } from '../ecs/queries';

/** Unoccupied cars stay parked. The one that spawns with you must not roll away. */
const coast = { throttle: 0, brake: 0, steer: 0, handbrake: true };

export function vehicleDriveSystem(ctx: GameContext, world: World): void {
  let driving = false;
  for (const eid of players(world)) {
    if (Player.mode[eid] !== Mode.Driving) continue;
    const vehicleEid = Player.vehicle[eid] ?? 0;
    const body = PhysicsRef.body[vehicleEid] ?? 0;
    if (body === 0) continue;
    driving = true;
    // A stolen lane car is a kinematic box. driveStolen moves it and owns its speed.
    if (hasComponent(world, vehicleEid, Traffic)) continue;
    const pressedThrottle = InputState.throttle[eid] ?? 0;
    const pressedBrake = InputState.brake[eid] ?? 0;
    let throttle = pressedThrottle;
    let brake = pressedBrake;
    const speed = ctx.physics.forwardSpeed(body);
    Vehicle.speed[vehicleEid] = speed;
    if (brake > 0 && speed <= 0.4) {
      throttle = -brake;
      brake = 0;
    } else if (throttle > 0 && speed < -0.4) {
      brake = throttle;
      throttle = 0;
    }
    throttle = limitThrottle(throttle, speed, Vehicle.maxSpeed[vehicleEid] ?? 0);
    let steer = InputState.steer[eid] ?? 0;
    if (speed > 1) steer *= 1.85;
    const tone = enginePlayback(true, speed, Math.abs(throttle));
    ctx.audio.setEngine(tone.frequency, tone.gain);
    const coasting =
      pressedThrottle === 0 &&
      pressedBrake === 0 &&
      InputState.handbrake[eid] !== 1 &&
      Math.abs(speed) > 0.35;
    ctx.physics.setVehicleInput(body, {
      throttle,
      brake,
      steer,
      handbrake: InputState.handbrake[eid] === 1,
      drag: coasting ? -Math.sign(speed) * 1600 : 0,
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

function limitThrottle(throttle: number, speed: number, maxForward: number): number {
  if (throttle > 0) {
    const cap = maxForward > 0 ? maxForward : sedan.maxForwardSpeed;
    if (speed >= cap) return 0;
    const fade = cap * 0.82;
    if (speed > fade) return throttle * ((cap - speed) / (cap - fade));
  }
  if (throttle < 0 && speed <= -sedan.maxReverseSpeed) return 0;
  return throttle;
}
