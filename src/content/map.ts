/** The test street near the origin. The island around it lives in city.ts. */

import { mapSchema, type MapContent } from './schemas';

/** Costa Verde island. The playable street stays near the origin. */
export const island = {
  width: 960,
  depth: 820,
  centerZ: 290,
  thickness: 1,
  color: 0x3c7a44,
};

export const streetPaint = {
  asphalt: 0x2c3138,
  sidewalk: 0xd9d3c7,
  curb: 0xe0c56a,
  lane: 0xf4f1e8,
};

export const testMap: MapContent = mapSchema.parse({
  ground: {
    width: island.width,
    depth: island.depth,
    thickness: island.thickness,
    color: island.color,
  },
  road: {
    x: 0,
    z0: -52,
    z1: 28,
    width: 7,
    ...streetPaint,
  },
});
