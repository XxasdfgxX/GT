import { describe, expect, it } from 'vitest';
import { sedan } from '../content/vehicles';
import { createRapierWorld } from '../engine/physics/rapier-world';
import type { Quat, Vec3 } from '../engine/core/math';

const dt = 1 / 60;

describe('sedan vehicle', () => {
  it('settles on the ground, drives forward, and stays upright', async () => {
    const physics = await createRapierWorld(-9.81);
    physics.createStaticBox({
      position: { x: 0, y: -0.5, z: 0 },
      halfExtents: { x: 40, y: 0.5, z: 400 },
    });
    const id = physics.createVehicle({
      position: sedan.spawn,
      halfExtents: sedan.halfExtents,
      mass: sedan.mass,
      wheelRadius: sedan.wheelRadius,
      suspensionRestLength: sedan.suspensionRestLength,
      suspensionStiffness: sedan.suspensionStiffness,
      suspensionCompression: sedan.suspensionCompression,
      suspensionRelaxation: sedan.suspensionRelaxation,
      maxSuspensionTravel: sedan.maxSuspensionTravel,
      maxSuspensionForce: sedan.maxSuspensionForce,
      frictionSlip: sedan.frictionSlip,
      sideFrictionStiffness: sedan.sideFrictionStiffness,
      engineForce: sedan.engineForce,
      brakeForce: sedan.brakeForce,
      handbrakeForce: sedan.handbrakeForce,
      maxSteer: sedan.maxSteer,
      steerSign: sedan.steerSign,
    });
    const position: Vec3 = { x: 0, y: 0, z: 0 };
    const rotation: Quat = { x: 0, y: 0, z: 0, w: 1 };

    for (let step = 0; step < 90; step += 1) {
      physics.setVehicleInput(id, { throttle: 0, brake: 0, steer: 0, handbrake: true });
      physics.step(dt);
    }
    physics.getTransform(id, position, rotation);
    expect(position.y).toBeGreaterThan(0.4);
    expect(position.y).toBeLessThan(2.2);
    const restedZ = position.z;

    for (let step = 0; step < 180; step += 1) {
      physics.setVehicleInput(id, { throttle: 1, brake: 0, steer: 0, handbrake: false });
      physics.step(dt);
    }
    physics.getTransform(id, position, rotation);
    expect(position.z).toBeGreaterThan(restedZ + 3);
    expect(position.y).toBeGreaterThan(0.3);
    expect(position.y).toBeLessThan(1.7);
    expect(Math.abs(rotation.x)).toBeLessThan(0.25);
    expect(Math.abs(rotation.z)).toBeLessThan(0.35);

    const moving = physics.forwardSpeed(id);
    let maxPitch = 0;
    let minY = 10;
    for (let step = 0; step < 120; step += 1) {
      physics.setVehicleInput(id, { throttle: 0, brake: 1, steer: 0, handbrake: false });
      physics.step(dt);
      physics.getTransform(id, position, rotation);
      maxPitch = Math.max(maxPitch, Math.abs(rotation.x));
      minY = Math.min(minY, position.y);
    }
    expect(Math.abs(physics.forwardSpeed(id))).toBeLessThan(Math.abs(moving) * 0.7);
    expect(minY).toBeGreaterThan(0.25);
    expect(maxPitch).toBeLessThan(0.5);
    physics.dispose();
  });

  it('turns left toward +X when A is held and the car faces +Z', async () => {
    const physics = await createRapierWorld(-9.81);
    physics.createStaticBox({
      position: { x: 0, y: -0.5, z: 0 },
      halfExtents: { x: 80, y: 0.5, z: 80 },
    });
    const id = physics.createVehicle({
      position: sedan.spawn,
      halfExtents: sedan.halfExtents,
      mass: sedan.mass,
      wheelRadius: sedan.wheelRadius,
      suspensionRestLength: sedan.suspensionRestLength,
      suspensionStiffness: sedan.suspensionStiffness,
      suspensionCompression: sedan.suspensionCompression,
      suspensionRelaxation: sedan.suspensionRelaxation,
      maxSuspensionTravel: sedan.maxSuspensionTravel,
      maxSuspensionForce: sedan.maxSuspensionForce,
      frictionSlip: sedan.frictionSlip,
      sideFrictionStiffness: sedan.sideFrictionStiffness,
      engineForce: sedan.engineForce,
      brakeForce: sedan.brakeForce,
      handbrakeForce: sedan.handbrakeForce,
      maxSteer: sedan.maxSteer,
      steerSign: sedan.steerSign,
    });
    const position: Vec3 = { x: 0, y: 0, z: 0 };
    const rotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
    for (let step = 0; step < 60; step += 1) {
      physics.setVehicleInput(id, { throttle: 0, brake: 0, steer: 0, handbrake: true });
      physics.step(dt);
    }
    physics.getTransform(id, position, rotation);
    const startX = position.x;
    for (let step = 0; step < 90; step += 1) {
      physics.setVehicleInput(id, { throttle: 1, brake: 0, steer: -1, handbrake: false });
      physics.step(dt);
    }
    physics.getTransform(id, position, rotation);
    expect(position.x).toBeGreaterThan(startX + 0.4);
    physics.dispose();
  });
});
