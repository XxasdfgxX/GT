/** Drivable specs. Torque 50 matches the sedan force the game already had. */

import { carModel } from './models';

export const astonModel = '/assets/aston-dbr1.glb';

export const carIds = ['aston', 'hatch', 'sedan', 'taxi', 'compact', 'pickup', 'van'] as const;

export type CarId = (typeof carIds)[number];

export interface CarProfile {
  id: CarId;
  name: string;
  /** 0–100. 50 is the force the sedan already used. */
  torque: number;
  maxSpeedKmh: number;
  /** Traffic mesh scale. The Aston is already in meters, so its scale is 1. */
  scale: number;
}

export interface CarBody {
  url: string;
  scale: number;
  mass: number;
  halfExtents: { x: number; y: number; z: number };
  wheelRadius: number;
  /** Subtracted from the street lift so the tires meet the asphalt. */
  ride: number;
  torque: number;
  maxSpeedKmh: number;
}

/** The raycast sedan was tuned at this visual scale, against a traffic sedan of 0.96. */
const tunedVisual = 0.9;
const tunedTraffic = 0.96;

export const carCatalog: readonly CarProfile[] = [
  { id: 'aston', name: 'Aston Martin DBR1', torque: 80, maxSpeedKmh: 200, scale: 1 },
  { id: 'hatch', name: 'Hatch', torque: 45, maxSpeedKmh: 140, scale: 0.86 },
  { id: 'sedan', name: 'Sedan', torque: 50, maxSpeedKmh: 150, scale: 0.96 },
  { id: 'taxi', name: 'Táxi', torque: 42, maxSpeedKmh: 130, scale: 0.96 },
  { id: 'compact', name: 'Compacto', torque: 38, maxSpeedKmh: 120, scale: 0.78 },
  { id: 'pickup', name: 'Pickup', torque: 55, maxSpeedKmh: 125, scale: 1.05 },
  { id: 'van', name: 'Van', torque: 32, maxSpeedKmh: 110, scale: 1.08 },
];

const referenceTorque = 50;
const referenceForce = 1500;
const referenceAccel = 9;

export function carById(id: string): CarProfile {
  const found = carCatalog.find((car) => car.id === id);
  if (!found) throw new Error(`Carro desconhecido: ${id}`);
  return found;
}

export function isCarId(id: string): id is CarId {
  return carCatalog.some((car) => car.id === id);
}

/** Admin off always parks the Aston. Admin on uses the saved id. */
export function starterCar(settings: { admin: boolean; car: string }): CarProfile {
  if (!settings.admin) return carById('aston');
  return isCarId(settings.car) ? carById(settings.car) : carById('aston');
}

export function engineForceFor(torque: number): number {
  return (referenceForce * torque) / referenceTorque;
}

export function maxSpeedMs(kmh: number): number {
  return kmh / 3.6;
}

export function driveAccel(torque: number): number {
  return (referenceAccel * torque) / referenceTorque;
}

export function carBody(id: CarId): CarBody {
  const car = carById(id);
  if (car.id === 'aston') {
    return {
      url: astonModel,
      scale: 1,
      mass: 280,
      halfExtents: { x: 0.85, y: 0.32, z: 1.9 },
      wheelRadius: 0.33,
      ride: 0.93,
      torque: car.torque,
      maxSpeedKmh: car.maxSpeedKmh,
    };
  }
  const fitted = car.scale / tunedTraffic;
  return {
    url: carModel,
    scale: tunedVisual * fitted,
    mass: 280 * fitted,
    halfExtents: { x: 0.85 * fitted, y: 0.36 * fitted, z: 1.9 * fitted },
    wheelRadius: 0.33 * fitted,
    ride: 1.04,
    torque: car.torque,
    maxSpeedKmh: car.maxSpeedKmh,
  };
}

/** Kinematic speed while the player drives a street car. Cruise speed stays elsewhere. */
export function stepDrivenSpeed(
  speed: number,
  input: { throttle: number; brake: number; handbrake: boolean },
  dt: number,
  torque: number,
  maxSpeedKmh: number,
): number {
  let next = speed;
  if (input.handbrake) next *= Math.max(0, 1 - dt * 5);
  if (input.brake > 0 && next > 0.4) next -= input.brake * 18 * dt;
  else if (input.brake > 0) next -= input.brake * 7 * dt;
  else next += input.throttle * driveAccel(torque) * dt;
  const cap = maxSpeedMs(maxSpeedKmh);
  if (next > cap) next = cap;
  if (next < -6) next = -6;
  return next;
}
