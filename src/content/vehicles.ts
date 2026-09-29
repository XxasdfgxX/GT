/** Placeholder sedan. Physics tuning lives here so the adapter stays generic. */

import { vehicleSchema, type VehicleContent } from './schemas';

export const sedan: VehicleContent = vehicleSchema.parse({
  id: 'sedan',
  mass: 280,
  halfExtents: { x: 0.85, y: 0.36, z: 1.9 },
  wheelRadius: 0.33,
  suspensionRestLength: 0.35,
  suspensionStiffness: 45,
  suspensionCompression: 4.4,
  suspensionRelaxation: 3.2,
  maxSuspensionTravel: 0.28,
  maxSuspensionForce: 14000,
  frictionSlip: 3.5,
  sideFrictionStiffness: 1,
  engineForce: 1500,
  brakeForce: 78,
  handbrakeForce: 90,
  /** About 90 km/h. Past this the throttle fades out. */
  maxForwardSpeed: 25,
  maxReverseSpeed: 7,
  maxSteer: 0.42,
  steerSign: -1,
  color: 0xc4553a,
  spawn: { x: 0, y: 1.5, z: 5 },
  /** Nose points down the street, the same way walking forward goes. */
  spawnYaw: Math.PI,
});
