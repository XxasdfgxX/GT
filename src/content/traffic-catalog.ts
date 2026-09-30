/** Traffic variants. One CC0 body, recolored and rescaled until more models exist. */

import { z } from 'zod';
import { carModel } from './models';

const trafficSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  mass: z.number().positive(),
  topSpeed: z.number().positive(),
  wheelNodes: z.array(z.string()),
  weight: z.number().positive(),
  tag: z.enum(['car', 'taxi', 'bus', 'truck', 'moto']),
  scale: z.number().positive(),
  color: z.number().int().nonnegative(),
});

export type TrafficVehicle = z.infer<typeof trafficSchema>;
export type TrafficTag = TrafficVehicle['tag'];

const wheels = [
  'NormalCar1_FrontLeftWheel_Cube.007',
  'NormalCar1_FrontRightWheel_Cube.008',
  'NormalCar1_BackWheels_Cube.011',
];

const specs: Array<[string, number, number, TrafficTag, number, number]> = [
  ['hatch', 0.86, 0xc4553a, 'car', 3, 12],
  ['sedan', 0.96, 0xf4f1ea, 'car', 3, 13],
  ['taxi', 0.96, 0xf2c14e, 'taxi', 2, 13],
  ['compact', 0.78, 0x2a2a2a, 'car', 2, 11],
  ['pickup', 1.05, 0x8a5a32, 'truck', 1, 11],
  ['van', 1.08, 0xd5dde4, 'bus', 1, 10],
];

export const trafficCatalog: TrafficVehicle[] = specs.map(
  ([id, scale, color, tag, weight, topSpeed]) =>
    trafficSchema.parse({
      id,
      url: carModel,
      length: 4.2 * scale,
      width: 1.8 * scale,
      height: 1.5 * scale,
      mass: 280 * scale,
      topSpeed,
      wheelNodes: wheels,
      weight,
      tag,
      scale,
      color,
    }),
);

export function pickTrafficVariant(roll: number): TrafficVehicle {
  let total = 0;
  for (const item of trafficCatalog) total += item.weight;
  let cursor = roll * total;
  for (const item of trafficCatalog) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  const fallback = trafficCatalog[0];
  if (!fallback) throw new Error('Catálogo de tráfego vazio');
  return fallback;
}
