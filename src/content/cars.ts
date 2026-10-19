/** Drivable specs. Torque 50 matches the sedan force the game already had. */

import { carModel } from './models';

export const astonModel = '/assets/aston-dbr1.glb';

export const carIds = [
  'aston',
  'hatch',
  'sedan',
  'taxi',
  'compact',
  'pickup',
  'van',
  'ferrari',
  'gtr',
  'bmw',
  'uaz',
] as const;

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
  { id: 'ferrari', name: 'Ferrari 488 Pista Spider', torque: 95, maxSpeedKmh: 280, scale: 1 },
  { id: 'gtr', name: 'Nissan GT-R Nismo', torque: 88, maxSpeedKmh: 250, scale: 1 },
  { id: 'bmw', name: 'BMW M340i', torque: 70, maxSpeedKmh: 220, scale: 1 },
  { id: 'uaz', name: 'UAZ 452', torque: 50, maxSpeedKmh: 130, scale: 1 },
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

/** One-off meshes, already in meters. Street cars keep the shared Quaternius body. */
const showcase: Partial<Record<CarId, Omit<CarBody, 'torque' | 'maxSpeedKmh'>>> = {
  aston: {
    url: astonModel,
    scale: 1,
    mass: 280,
    halfExtents: { x: 0.85, y: 0.32, z: 1.9 },
    wheelRadius: 0.33,
    ride: 0.93,
  },
  ferrari: {
    url: '/assets/ferrari-488.glb',
    scale: 1,
    mass: 300,
    halfExtents: { x: 1.12, y: 0.39, z: 2.16 },
    wheelRadius: 0.34,
    ride: 0.52,
  },
  gtr: {
    url: '/assets/nissan-gtr.glb',
    scale: 1,
    mass: 400,
    halfExtents: { x: 1, y: 0.45, z: 2.22 },
    wheelRadius: 0.35,
    ride: 0.49,
  },
  bmw: {
    url: '/assets/bmw-m340i.glb',
    scale: 1,
    mass: 370,
    halfExtents: { x: 1.02, y: 0.44, z: 2.24 },
    wheelRadius: 0.34,
    ride: 0.48,
  },
  uaz: {
    url: '/assets/uaz-452.glb',
    scale: 1,
    mass: 600,
    halfExtents: { x: 1.2, y: 0.77, z: 1.85 },
    wheelRadius: 0.42,
    ride: 0.37,
  },
};

export function carBody(id: CarId): CarBody {
  const car = carById(id);
  const unique = showcase[car.id];
  if (unique) {
    return { ...unique, torque: car.torque, maxSpeedKmh: car.maxSpeedKmh };
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
  else if (input.throttle > 0) next += input.throttle * driveAccel(torque) * dt;
  else next = coastToStop(next, dt);
  const cap = maxSpeedMs(maxSpeedKmh);
  if (next > cap) next = cap;
  if (next < -6) next = -6;
  return next;
}

/** Rolling resistance once the driver lifts off. About 4.5 m/s² toward a stop. */
function coastToStop(speed: number, dt: number): number {
  const drop = 4.5 * dt;
  if (speed > 0) return Math.max(0, speed - drop);
  if (speed < 0) return Math.min(0, speed + drop);
  return 0;
}
