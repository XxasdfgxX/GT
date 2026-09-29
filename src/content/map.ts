/** Street block with Kenney houses. The island around it lives in city.ts. */

import { mapSchema, type MapContent } from './schemas';

const left = Math.PI / 2;
const right = -Math.PI / 2;

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
  buildings: [
    {
      model: '/assets/buildings/house-a.glb',
      x: -14,
      z: 22,
      yaw: left,
      scale: 8,
      sx: 8.24,
      sy: 6.64,
      sz: 10.4,
    },
    {
      model: '/assets/buildings/house-b.glb',
      x: -14,
      z: 8,
      yaw: left,
      scale: 6,
      sx: 6.84,
      sy: 6.84,
      sz: 10.98,
    },
    {
      model: '/assets/buildings/house-e.glb',
      x: -14,
      z: -6,
      yaw: left,
      scale: 7,
      sx: 7.21,
      sy: 7.98,
      sz: 9.1,
    },
    {
      model: '/assets/buildings/house-f.glb',
      x: -14,
      z: -20,
      yaw: left,
      scale: 6.5,
      sx: 9.17,
      sy: 7.41,
      sz: 9.3,
    },
    {
      model: '/assets/buildings/house-k.glb',
      x: -14,
      z: -36,
      yaw: left,
      scale: 7,
      sx: 7.14,
      sy: 8.05,
      sz: 6.44,
    },
    {
      model: '/assets/buildings/house-b.glb',
      x: 14,
      z: 18,
      yaw: right,
      scale: 6,
      sx: 6.84,
      sy: 6.84,
      sz: 10.98,
    },
    {
      model: '/assets/buildings/house-a.glb',
      x: 14,
      z: 4,
      yaw: right,
      scale: 8,
      sx: 8.24,
      sy: 6.64,
      sz: 10.4,
    },
    {
      model: '/assets/buildings/house-f.glb',
      x: 14,
      z: -10,
      yaw: right,
      scale: 6.5,
      sx: 9.17,
      sy: 7.41,
      sz: 9.3,
    },
    {
      model: '/assets/buildings/house-e.glb',
      x: 14,
      z: -24,
      yaw: right,
      scale: 7,
      sx: 7.21,
      sy: 7.98,
      sz: 9.1,
    },
    {
      model: '/assets/buildings/house-k.glb',
      x: 14,
      z: -40,
      yaw: right,
      scale: 7,
      sx: 7.14,
      sy: 8.05,
      sz: 6.44,
    },
  ],
});
