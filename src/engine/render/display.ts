/** Color pipeline and pixel density for the WebGL renderer. */

export const MAX_PIXEL_RATIO = 2;
export const DEFAULT_EXPOSURE = 1.08;

export function cappedPixelRatio(devicePixelRatio: number, cap = MAX_PIXEL_RATIO): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  return Math.min(devicePixelRatio, cap);
}

/** The canvas uses MSAA only while the post-processing composer is off. SMAA replaces it. */
export function canvasAntialias(postProcessing: boolean): boolean {
  return !postProcessing;
}
