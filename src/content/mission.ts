/** Pickup crate and the dropoff pad at the far end of the street. */

import { z } from 'zod';

const point = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const missionSchema = z.object({
  pickup: point,
  dropoff: point,
  radius: z.number().positive(),
});

export const delivery = missionSchema.parse({
  pickup: { x: 0, y: 0.4, z: 9.2 },
  dropoff: { x: 0, y: 0.04, z: -40 },
  radius: 2.6,
});
