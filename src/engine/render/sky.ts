/**
 * The three Poly Haven skies the day blends between. Each was measured with
 * scripts/measure-hdri.mjs: `u` and `elevation` place its sun (the moon at night) in
 * three's equirect layout, and `horizon` is the sRGB mean just above the horizon.
 */

export interface SkyImage {
  url: string;
  /** Equirect u of the bright disc: atan2(z, x) / 2π + 0.5. */
  u: number;
  /** Degrees above the horizon of the bright disc. */
  elevation: number;
  /** Brightness against the day sky, applied in the mix. Each capture has its own exposure. */
  gain: number;
  horizon: number;
}

export const SKIES = {
  day: {
    url: '/assets/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr',
    u: 0.5951,
    elevation: 47.9,
    gain: 1,
    horizon: 0xb0b6c6,
  },
  // Its sun sits behind cloud on the horizon: the glow, not a disc.
  sunset: {
    url: '/assets/hdri/kloppenheim_06_puresky_2k.hdr',
    u: 0.613,
    elevation: 4.7,
    gain: 0.55,
    horizon: 0xffeddc,
  },
  // A long exposure of a moonlit night: bright as captured, so it is turned well down.
  night: {
    url: '/assets/hdri/kloppenheim_02_puresky_2k.hdr',
    u: 0.5989,
    elevation: 17,
    gain: 0.035,
    horizon: 0xa2aebb,
  },
} as const satisfies Record<string, SkyImage>;

export type SkyName = keyof typeof SKIES;

/** Exponential haze: about 12% at 520 m, half at 1.2 km, nearly opaque at 2.4 km. */
export const FOG_DENSITY = 0.0007;

/**
 * The clouds dim this sky about 30% against the clear one the lights were tuned for, and
 * walls in shade get nearly all their light from it.
 */
export const SKY_FILL = 1.5;
