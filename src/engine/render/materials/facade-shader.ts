/**
 * Windows drawn on building walls from the per-instance `facade` attribute: floor height,
 * style, ground floor and seed. Floors, bays, frames and glass come from the wall's own
 * size in meters, so one unit box reads as a building of any height.
 */

import type { SurfaceFinish } from '../renderer';

/** Wall finishes that carry a facade attribute. */
export const WALL_FINISHES: ReadonlySet<SurfaceFinish> = new Set([
  'paint',
  'brick',
  'concrete-raw',
  'tile',
]);

/**
 * Per style: target bay width (m), window width and height as a share of the bay and the
 * floor, and the sill height as a share of the floor. Order matches `FACADE_STYLES`.
 */
export const FACADE_WINDOWS = [
  [3.0, 0.5, 0.5, 0.32],
  [3.2, 0.82, 0.42, 0.4],
  [2.6, 0.42, 0.5, 0.32],
  [3.0, 0.5, 0.5, 0.32],
  [1.6, 0.92, 0.84, 0.08],
  [2.8, 0.38, 0.64, 0.2],
] as const;

export const facadeVertexHead = /* glsl */ `
attribute vec4 facade;
varying vec4 vFacade;
varying vec3 vWallLocal;
varying vec3 vWallSize;
varying vec3 vWallNormal;
`;

export const facadeVertexBody = /* glsl */ `
vWallSize = vec3(
  length(instanceMatrix[0].xyz),
  length(instanceMatrix[1].xyz),
  length(instanceMatrix[2].xyz)
);
vWallLocal = position * vWallSize;
vWallNormal = normal;
vFacade = facade;
`;

export const facadeFragmentHead = /* glsl */ `
varying vec4 vFacade;
varying vec3 vWallLocal;
varying vec3 vWallSize;
varying vec3 vWallNormal;

float wallHash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
}

vec4 wallStyle(float style) {
  ${FACADE_WINDOWS.map(
    (row, index) =>
      `if (style < ${index}.5) return vec4(${row.map((value) => value.toFixed(2)).join(', ')});`,
  ).join('\n  ')}
  return vec4(${FACADE_WINDOWS[0].map((value) => value.toFixed(2)).join(', ')});
}
`;

/** Runs after roughness is read. Sets `wallGlass` so the normal map can skip the panes. */
export const facadeFragmentBody = /* glsl */ `
if (vFacade.x > 0.0 && abs(vWallNormal.y) < 0.5) {
  float floorH = vFacade.x;
  vec4 look = wallStyle(vFacade.y);
  bool sideX = abs(vWallNormal.x) > 0.5;
  float along = sideX ? vWallLocal.z : vWallLocal.x;
  float width = sideX ? vWallSize.z : vWallSize.x;
  float h = vWallLocal.y + vWallSize.y * 0.5;
  float level = floor(h / floorH);
  float fy = fract(h / floorH);
  // Whole bays only: the wall is split evenly, so no window is cut by a corner.
  float bays = max(1.0, floor(width / look.x + 0.5));
  float bayW = width / bays;
  float u = (along / width + 0.5) * bays;
  float bay = floor(u);
  float fx = fract(u);
  vec2 pane = look.yz;
  float sill = look.w;
  if (level < 0.5 && vFacade.z > 0.5) {
    // Shopfront: wide glass from just above the pavement.
    pane = vec2(0.88, 0.74);
    sill = 0.07;
  }
  float frameX = 0.08 / bayW;
  float frameY = 0.08 / floorH;
  float dx = abs(fx - 0.5);
  float inFrame = step(dx, pane.x * 0.5) * step(sill, fy) * step(fy, sill + pane.y);
  float inGlass = step(dx, pane.x * 0.5 - frameX) * step(sill + frameY, fy) * step(fy, sill + pane.y - frameY);
  // A slab line at each floor, darker on raw concrete bands.
  float band = step(fy, 0.035) * step(0.5, level);
  diffuseColor.rgb *= 1.0 - 0.18 * band;
  if (inFrame > 0.5) {
    float n = wallHash(vec3(level, bay, vFacade.w + (sideX ? 17.0 : 0.0)));
    vec3 glass = mix(vec3(0.035, 0.045, 0.055), vec3(0.12, 0.13, 0.14), n);
    // Some rooms have the curtains drawn.
    if (n > 0.78) glass = mix(vec3(0.42, 0.36, 0.28), vec3(0.6, 0.56, 0.5), fract(n * 7.0)) * 0.55;
    vec3 frame = vec3(0.82, 0.82, 0.8);
    diffuseColor.rgb = mix(frame, glass, inGlass);
    roughnessFactor = mix(0.45, 0.05, inGlass);
    wallGlass = inGlass;
  }
  // Homes get a 1 m by 2.1 m front door in the middle bay instead of its window.
  if (level < 0.5 && abs(vFacade.z) < 0.5 && vWallNormal.z > 0.5 && abs(bay - floor(bays * 0.5)) < 0.5) {
    float halfDoor = 0.5 / bayW;
    float doorTop = 2.1 / floorH;
    float inDoorFrame = step(dx, halfDoor + frameX) * step(fy, doorTop + frameY);
    float inDoor = step(dx, halfDoor) * step(fy, doorTop);
    if (inDoorFrame > 0.5) {
      float n = wallHash(vec3(bay, vFacade.w, 3.0));
      vec3 leaf = mix(vec3(0.28, 0.17, 0.1), vec3(0.12, 0.3, 0.3), step(0.6, n));
      diffuseColor.rgb = mix(vec3(0.82, 0.82, 0.8), leaf, inDoor);
      roughnessFactor = 0.6;
      wallGlass = 0.0;
    }
  }
}
`;
