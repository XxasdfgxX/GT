/** Billboard health fill. Local +X is screen-right, so damage empties toward the left edge. */

import { STREET_LIFT } from '../../content/map/road-mesh';
import { sim } from '../../content/sim';

export const HEALTH_TRACK_WIDTH = 0.72;

/** Scaled character, from the capsule center up to the crown. */
const MODEL_HEIGHT = 1.76;
const capsuleCenter = sim.playerRadius + sim.playerHalfHeight;
export const HEAD_TOP_FROM_CENTER = MODEL_HEIGHT - (capsuleCenter - STREET_LIFT);
export const PLAYER_BAR_LIFT = HEAD_TOP_FROM_CENTER + 0.12;
export const PLAYER_TAG_LIFT = PLAYER_BAR_LIFT + 0.1;

/** From the car pose up to a point just above the roof. */
export function carRoofLift(height: number): number {
  return height / 2 + STREET_LIFT + 0.25;
}

const FILL_WIDTH = 0.66;
const MIN_FILL = 0.04;
const FILL_BIAS = 0.04;

export function healthFillLayout(
  hp: number,
  cameraYaw: number,
): { width: number; x: number; z: number } {
  const ratio = Math.max(0, Math.min(1, hp));
  const width = Math.max(MIN_FILL, FILL_WIDTH * ratio);
  const shift = (width - FILL_WIDTH) / 2;
  return {
    width,
    x: Math.cos(cameraYaw) * shift + Math.sin(cameraYaw) * FILL_BIAS,
    z: -Math.sin(cameraYaw) * shift + Math.cos(cameraYaw) * FILL_BIAS,
  };
}
