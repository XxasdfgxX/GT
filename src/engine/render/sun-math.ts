/**
 * Sun, moon and sky through the day, from the time of day (0 midnight, 0.5 noon).
 * +x is east and -z north: the sun rises at +x, passes north of the zenith, as it does
 * over Rio, and sets at -x. The moon stands opposite it.
 */

import { SKIES, type SkyName } from './sky';

export interface SunVector {
  x: number;
  y: number;
  z: number;
}

export const SUNRISE_HOUR = 6;
export const SUNSET_HOUR = 18;
/** Noon elevation, in radians. */
const NOON_ELEVATION = (70 * Math.PI) / 180;

/** Lights in the renderer's own units, so a test can read what the frame will get. */
export interface DayLight {
  /** sin of the sun's elevation: below 0 at night. */
  sunHeight: number;
  /** Toward the light that casts: the sun by day, the moon by night. Unit length. */
  light: SunVector;
  lightColor: number;
  lightIntensity: number;
  shadows: boolean;
  /** Mix of the three skies; sums to 1. */
  weights: Record<SkyName, number>;
  /** Equirect u each sky's disc should land on: the sun for day and sunset, the moon at night. */
  targetU: Record<SkyName, number>;
  ambient: number;
  hemisphere: number;
  /** Scale on everything lit, so the night reads without going black. */
  exposure: number;
  /** Linear RGB. */
  fog: [number, number, number];
  fogDensityScale: number;
  /** 0 by day, 1 at night: lamps, windows and headlights. */
  nightLight: number;
}

export function wrapDay(time: number): number {
  if (!Number.isFinite(time)) return 0.5;
  return ((time % 1) + 1) % 1;
}

/** Toward the sun. Below the horizon (y < 0) between sunset and sunrise. */
export function directionAtTime(time: number, out: SunVector): void {
  const hours = wrapDay(time) * 24;
  // A great circle tilted to the north: east at sunrise, high in the north at noon, west
  // at sunset, and on round under the ground at night.
  const turn = ((hours - SUNRISE_HOUR) / (SUNSET_HOUR - SUNRISE_HOUR)) * Math.PI;
  out.x = Math.cos(turn);
  out.y = Math.sin(turn) * Math.sin(NOON_ELEVATION);
  out.z = -Math.sin(turn) * Math.cos(NOON_ELEVATION);
}

export function equirectU(direction: SunVector): number {
  return Math.atan2(direction.z, direction.x) / (Math.PI * 2) + 0.5;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function linear(hex: number, channel: number): number {
  const c = ((hex >> (16 - channel * 8)) & 0xff) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function mixHex(a: number, b: number, t: number): number {
  let out = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    const shift = 16 - channel * 8;
    const value = Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
    out |= value << shift;
  }
  return out;
}

const sunPoint: SunVector = { x: 0, y: 0, z: 0 };

export function dayLightAt(time: number): DayLight {
  directionAtTime(time, sunPoint);
  const height = sunPoint.y;
  const day = smoothstep(0.08, 0.35, height);
  const sunset = smoothstep(-0.25, 0, height) * (1 - day);
  const night = Math.max(0, 1 - day - sunset);
  const moon = { x: -sunPoint.x, y: -sunPoint.y, z: -sunPoint.z };
  const sunUp = height >= 0;
  const lightIntensity = sunUp
    ? 1.85 * smoothstep(0, 0.25, height)
    : 0.16 * smoothstep(0, 0.15, -height);
  const lightColor = sunUp ? mixHex(0xff9a5a, 0xfff6ea, smoothstep(0.05, 0.45, height)) : 0x9fb4d8;
  const exposure = 1 + 0.6 * night;
  const horizon = (channel: number) =>
    (day * SKIES.day.gain * linear(SKIES.day.horizon, channel) +
      sunset * SKIES.sunset.gain * linear(SKIES.sunset.horizon, channel) +
      night * SKIES.night.gain * linear(SKIES.night.horizon, channel)) *
    exposure;
  const fog: [number, number, number] = [horizon(0), horizon(1), horizon(2)];
  const sunU = equirectU(sunPoint);
  return {
    sunHeight: height,
    light: sunUp ? { ...sunPoint } : moon,
    lightColor,
    lightIntensity,
    // Long streaks at a grazing light are worse than none.
    shadows: lightIntensity > 0.05 && Math.abs(height) > 0.06,
    weights: { day, sunset, night },
    targetU: { day: sunU, sunset: sunU, night: equirectU(moon) },
    ambient: 0.04 * (day + sunset) + 0.05 * night,
    hemisphere: 0.18 * (day + 0.5 * sunset) + 0.04 * night,
    exposure,
    fog,
    fogDensityScale: 1 + 0.3 * night,
    nightLight: 1 - smoothstep(-0.12, 0.08, height),
  };
}

export function snapToTexel(value: number, texel: number): number {
  if (!(texel > 0)) return value;
  return Math.round(value / texel) * texel;
}
