/** Billboard health fill. Local +X is screen-right, so damage empties toward the left edge. */

export const HEALTH_TRACK_WIDTH = 0.72;

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
