/** Clear-sky coast HDRI. The sun vector is the disc centroid, already unit length. */

export const COAST_HDRI_URL = '/assets/hdri/kloofendal_43d_clear_puresky_2k.hdr';

export const HDRI_SUN = {
  x: 0.59108,
  y: 0.68098,
  z: 0.43231,
} as const;

/** sRGB color sampled on the HDRI equator. */
export const HORIZON_COLOR = 0xc9cdd6;

export function hdriSunLength(): number {
  return Math.hypot(HDRI_SUN.x, HDRI_SUN.y, HDRI_SUN.z);
}
