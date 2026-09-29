/** Local sedan parts. The nose is +Z, matching the physics forward axis. */

import type { Vec3 } from '../../../engine/core/math';

export type SedanRole = 'cabin' | 'hood' | 'trunk' | 'glass' | 'bumper' | 'headlight' | 'taillight';

export interface SedanPart {
  role: SedanRole;
  size: Vec3;
  color: number;
  position: Vec3;
  roughness: number;
  metalness: number;
  emissive: number;
}

export function sedanParts(half: Vec3, body: number): SedanPart[] {
  const { x: hx, y: hy, z: hz } = half;
  const lamp = { x: hx * 0.46, y: hy * 0.34, z: hz * 0.1 };
  return [
    {
      role: 'cabin',
      size: { x: hx * 1.42, y: hy * 0.72, z: hz * 0.5 },
      color: body,
      position: { x: 0, y: hy * 1.02, z: -hz * 0.02 },
      roughness: 0.42,
      metalness: 0.38,
      emissive: 0,
    },
    {
      role: 'glass',
      size: { x: hx * 1.26, y: hy * 0.4, z: hz * 0.4 },
      color: 0x8fbfce,
      position: { x: 0, y: hy * 1.2, z: hz * 0.02 },
      roughness: 0.06,
      metalness: 0.12,
      emissive: 0,
    },
    {
      role: 'hood',
      size: { x: hx * 1.7, y: hy * 0.26, z: hz * 0.42 },
      color: body,
      position: { x: 0, y: hy * 0.38, z: hz * 0.5 },
      roughness: 0.38,
      metalness: 0.42,
      emissive: 0,
    },
    {
      role: 'trunk',
      size: { x: hx * 1.55, y: hy * 0.34, z: hz * 0.22 },
      color: body,
      position: { x: 0, y: hy * 0.48, z: -hz * 0.62 },
      roughness: 0.42,
      metalness: 0.38,
      emissive: 0,
    },
    {
      role: 'bumper',
      size: { x: hx * 1.86, y: hy * 0.26, z: hz * 0.08 },
      color: 0x24272b,
      position: { x: 0, y: -hy * 0.2, z: hz * 0.92 },
      roughness: 0.72,
      metalness: 0.25,
      emissive: 0,
    },
    {
      role: 'bumper',
      size: { x: hx * 1.86, y: hy * 0.26, z: hz * 0.08 },
      color: 0x24272b,
      position: { x: 0, y: -hy * 0.2, z: -hz * 0.92 },
      roughness: 0.72,
      metalness: 0.25,
      emissive: 0,
    },
    {
      role: 'bumper',
      size: { x: hx * 0.72, y: hy * 0.38, z: hz * 0.05 },
      color: 0x141618,
      position: { x: 0, y: hy * 0.05, z: hz * 0.97 },
      roughness: 0.55,
      metalness: 0.4,
      emissive: 0,
    },
    lampAt('headlight', -hx * 0.62, hy * 0.22, hz * 0.96, lamp, 0xfff6d8, 0xfff1b8),
    lampAt('headlight', hx * 0.62, hy * 0.22, hz * 0.96, lamp, 0xfff6d8, 0xfff1b8),
    lampAt('taillight', -hx * 0.68, hy * 0.28, -hz * 0.96, lamp, 0xd02020, 0xff3333),
    lampAt('taillight', hx * 0.68, hy * 0.28, -hz * 0.96, lamp, 0xd02020, 0xff3333),
  ];
}

function lampAt(
  role: 'headlight' | 'taillight',
  x: number,
  y: number,
  z: number,
  size: Vec3,
  color: number,
  emissive: number,
): SedanPart {
  return {
    role,
    size,
    color,
    position: { x, y, z },
    roughness: 0.25,
    metalness: 0.05,
    emissive,
  };
}
