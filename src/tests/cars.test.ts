import { describe, expect, it } from 'vitest';
import {
  carBody,
  carById,
  driveAccel,
  engineForceFor,
  maxSpeedMs,
  starterCar,
  stepDrivenSpeed,
} from '../content/cars';
import { trafficCatalog } from '../content/traffic-catalog';

describe('car specs', () => {
  it('gives the Aston 200 km/h and torque 80', () => {
    const aston = carById('aston');
    expect(aston.maxSpeedKmh).toBe(200);
    expect(aston.torque).toBe(80);
    expect(maxSpeedMs(200)).toBeCloseTo(200 / 3.6, 5);
    expect(engineForceFor(80)).toBe(2400);
    expect(engineForceFor(50)).toBe(1500);
  });

  it('keeps the tuned sedan body when that car is parked', () => {
    const body = carBody('sedan');
    expect(body.scale).toBeCloseTo(0.9, 5);
    expect(body.halfExtents).toEqual({ x: 0.85, y: 0.36, z: 1.9 });
    expect(body.ride).toBe(1.04);
  });

  it('parks the Aston unless admin picked another car', () => {
    expect(starterCar({ admin: false, car: 'van' }).id).toBe('aston');
    expect(starterCar({ admin: true, car: 'pickup' }).id).toBe('pickup');
    expect(starterCar({ admin: true, car: 'foguete' }).id).toBe('aston');
  });

  it('keeps the UAZ at 120 km/h and the other showcase cars faster', () => {
    expect(carById('uaz').maxSpeedKmh).toBe(120);
    expect(carById('bmw').maxSpeedKmh).toBe(220);
    expect(carById('gtr').maxSpeedKmh).toBe(250);
    expect(carById('ferrari').maxSpeedKmh).toBe(280);
    for (const id of ['ferrari', 'gtr', 'bmw', 'uaz'] as const) {
      expect(trafficCatalog.some((car) => car.id === id)).toBe(false);
      expect(carBody(id).url.endsWith('.glb')).toBe(true);
      expect(carBody(id).url).not.toContain('car.glb');
    }
  });

  it('leaves the Aston out of street traffic', () => {
    expect(trafficCatalog.some((car) => car.id === 'aston')).toBe(false);
    const sedan = trafficCatalog.find((car) => car.id === 'sedan');
    expect(sedan?.torque).toBe(50);
    expect(sedan?.maxSpeedKmh).toBe(150);
    expect(sedan?.topSpeed).toBe(13);
  });

  it('caps a driven street car at its max speed and scales acceleration with torque', () => {
    const fast = stepDrivenSpeed(0, { throttle: 1, brake: 0, handbrake: false }, 1, 80, 200);
    const slow = stepDrivenSpeed(0, { throttle: 1, brake: 0, handbrake: false }, 1, 32, 110);
    expect(fast).toBeCloseTo(driveAccel(80), 5);
    expect(slow).toBeLessThan(fast);
    const capped = stepDrivenSpeed(54, { throttle: 1, brake: 0, handbrake: false }, 1, 80, 200);
    expect(capped).toBeCloseTo(maxSpeedMs(200), 5);
  });
});
