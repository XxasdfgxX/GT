/** Schemas for authored vehicle and blockout data. */

import { z } from 'zod';

const vec3 = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const vehicleSchema = z.object({
  id: z.string().min(1),
  mass: z.number().positive(),
  halfExtents: vec3,
  wheelRadius: z.number().positive(),
  suspensionRestLength: z.number().positive(),
  suspensionStiffness: z.number().positive(),
  suspensionCompression: z.number().nonnegative(),
  suspensionRelaxation: z.number().nonnegative(),
  maxSuspensionTravel: z.number().positive(),
  maxSuspensionForce: z.number().positive(),
  frictionSlip: z.number().positive(),
  sideFrictionStiffness: z.number().positive(),
  engineForce: z.number().positive(),
  brakeForce: z.number().positive(),
  handbrakeForce: z.number().positive(),
  maxForwardSpeed: z.number().positive(),
  maxReverseSpeed: z.number().positive(),
  maxSteer: z.number().positive(),
  steerSign: z.union([z.literal(1), z.literal(-1)]),
  color: z.number().int().nonnegative(),
  spawn: vec3,
  spawnYaw: z.number(),
});

export const mapSchema = z.object({
  ground: z.object({
    width: z.number().positive(),
    depth: z.number().positive(),
    thickness: z.number().positive(),
    color: z.number().int().nonnegative(),
  }),
  road: z.object({
    x: z.number(),
    z0: z.number(),
    z1: z.number(),
    width: z.number().positive(),
    asphalt: z.number().int().nonnegative(),
    sidewalk: z.number().int().nonnegative(),
    curb: z.number().int().nonnegative(),
    lane: z.number().int().nonnegative(),
    /** Along Z by default. Along X, `x` is the Z position and z0/z1 are the X ends. */
    axis: z.enum(['x', 'z']).optional(),
  }),
});

export type VehicleContent = z.infer<typeof vehicleSchema>;
export type MapContent = z.infer<typeof mapSchema>;
