/** Day arc around the HDRI sun. 0.5 is the captured afternoon. */

import { HDRI_SUN } from './sky';

export interface SunVector {
  x: number;
  y: number;
  z: number;
}

export function wrapDay(time: number): number {
  if (!Number.isFinite(time)) return 0.5;
  return ((time % 1) + 1) % 1;
}

export function directionAtTime(time: number, out: SunVector): void {
  const t = wrapDay(time);
  const spin = (t - 0.5) * Math.PI * 2;
  const cos = Math.cos(spin);
  const sin = Math.sin(spin);
  const x = HDRI_SUN.x * cos - HDRI_SUN.z * sin;
  const z = HDRI_SUN.x * sin + HDRI_SUN.z * cos;
  const lift = Math.sin(t * Math.PI);
  const y = HDRI_SUN.y * lift + (lift - 1) * 0.2;
  const len = Math.hypot(x, y, z) || 1;
  out.x = x / len;
  out.y = y / len;
  out.z = z / len;
}

export function snapToTexel(value: number, texel: number): number {
  if (!(texel > 0)) return value;
  return Math.round(value / texel) * texel;
}
