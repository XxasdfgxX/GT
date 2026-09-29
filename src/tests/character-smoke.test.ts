import { describe, expect, it } from 'vitest';
import { sim } from '../content/sim';
import { sedan } from '../content/vehicles';
import { createRapierWorld } from '../engine/physics/rapier-world';
import type { Quat, Vec3 } from '../engine/core/math';

describe('player capsule', () => {
  it('lands on the ground and walks forward', async () => {
    const physics = await createRapierWorld(sim.worldGravity);
    physics.createStaticBox({
      position: { x: 0, y: -0.5, z: 0 },
      halfExtents: { x: 40, y: 0.5, z: 40 },
    });
    const id = physics.createCharacter({
      position: { x: 0, y: 3, z: 0 },
      radius: sim.playerRadius,
      halfHeight: sim.playerHalfHeight,
    });
    const position: Vec3 = { x: 0, y: 0, z: 0 };
    const rotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
    let vertical = 0;
    for (let step = 0; step < 150; step += 1) {
      const grounded = physics.isGrounded(id);
      vertical += sim.gravity * sim.fixedDt;
      if (grounded && vertical < 0) vertical = 0;
      physics.moveCharacter(id, {
        x: 0,
        y: vertical * sim.fixedDt,
        z: -sim.walkSpeed * sim.fixedDt,
      });
      physics.step(sim.fixedDt);
      if (physics.isGrounded(id) && vertical < 0) vertical = 0;
    }
    physics.getTransform(id, position, rotation);
    expect(position.y).toBeGreaterThan(0.6);
    expect(position.y).toBeLessThan(1.3);
    expect(position.z).toBeLessThan(-2);
    physics.dispose();
  });

  it('does not launch when walking into the car', async () => {
    const physics = await createRapierWorld(sim.worldGravity);
    physics.createStaticBox({
      position: { x: 0, y: -0.5, z: 0 },
      halfExtents: { x: 40, y: 0.5, z: 40 },
    });
    physics.createVehicle({
      position: { x: 0, y: 1.5, z: 0 },
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
    const id = physics.createCharacter({
      position: { x: 0, y: sim.playerRadius + sim.playerHalfHeight, z: 4 },
      radius: sim.playerRadius,
      halfHeight: sim.playerHalfHeight,
    });
    const position: Vec3 = { x: 0, y: 0, z: 0 };
    const rotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
    let vertical = 0;
    let peak = 0;
    for (let step = 0; step < 180; step += 1) {
      const grounded = physics.isGrounded(id);
      vertical += sim.gravity * sim.fixedDt;
      if (grounded && vertical < 0) vertical = 0;
      physics.moveCharacter(id, {
        x: 0,
        y: vertical * sim.fixedDt,
        z: -sim.walkSpeed * sim.fixedDt,
      });
      physics.step(sim.fixedDt);
      if (physics.isGrounded(id) && vertical < 0) vertical = 0;
      physics.getTransform(id, position, rotation);
      peak = Math.max(peak, position.y);
    }
    expect(peak).toBeLessThan(3);
    expect(position.y).toBeLessThan(2);
    physics.dispose();
  });
});
