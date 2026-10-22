/** Partly cloudy midday HDRI. The sun vector is the disc centroid, already unit length. */

export const COAST_HDRI_URL = '/assets/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr';

export const HDRI_SUN = {
  x: 0.55435,
  y: 0.74175,
  z: 0.37749,
} as const;

/** sRGB color sampled on the HDRI equator. */
export const HORIZON_COLOR = 0xacb2c2;

/** Exponential haze: about 12% at 520 m, half at 1.2 km, nearly opaque at 2.4 km. */
export const FOG_DENSITY = 0.0007;

export function hdriSunLength(): number {
  return Math.hypot(HDRI_SUN.x, HDRI_SUN.y, HDRI_SUN.z);
}
