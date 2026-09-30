/** Color pipeline and pixel density for the WebGL renderer. */

export const MAX_PIXEL_RATIO = 2;
export const DEFAULT_EXPOSURE = 1.08;

export const shadowQualities = ['off', 'low', 'high'] as const;
export type ShadowQuality = (typeof shadowQualities)[number];

export const sharpnessLevels = ['low', 'medium', 'high'] as const;
export type Sharpness = (typeof sharpnessLevels)[number];

/** Shadow map edge length. Zero turns shadows off. */
export function shadowMapSize(quality: ShadowQuality): number {
  if (quality === 'off') return 0;
  if (quality === 'low') return 1024;
  return 2048;
}

/** Upper bound passed to the pixel-ratio cap. */
export function sharpnessCap(level: Sharpness): number {
  if (level === 'low') return 1;
  if (level === 'medium') return 1.5;
  return MAX_PIXEL_RATIO;
}

export function cappedPixelRatio(devicePixelRatio: number, cap = MAX_PIXEL_RATIO): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  return Math.min(devicePixelRatio, cap);
}

/** The canvas uses MSAA only while the post-processing composer is off. SMAA replaces it. */
export function canvasAntialias(postProcessing: boolean): boolean {
  return !postProcessing;
}
