/** Scales box UVs so one texture tile covers `tile` meters on each face. */

const faceMeters = (
  sx: number,
  sy: number,
  sz: number,
): ReadonlyArray<readonly [number, number]> => [
  [sz, sy],
  [sz, sy],
  [sx, sz],
  [sx, sz],
  [sx, sy],
  [sx, sy],
];

export function scaleBoxUv(
  uv: ArrayLike<number>,
  out: Float32Array,
  sx: number,
  sy: number,
  sz: number,
  tile: number,
): void {
  const safeTile = tile > 0 ? tile : 1;
  const floatsPerFace = uv.length / 6;
  if (!Number.isInteger(floatsPerFace) || floatsPerFace < 2) return;
  const faces = faceMeters(sx, sy, sz);
  for (let face = 0; face < 6; face += 1) {
    const edge = faces[face];
    if (!edge) continue;
    const base = face * floatsPerFace;
    for (let i = 0; i < floatsPerFace; i += 2) {
      out[base + i] = (uv[base + i] ?? 0) * (edge[0] / safeTile);
      out[base + i + 1] = (uv[base + i + 1] ?? 0) * (edge[1] / safeTile);
    }
  }
}

/**
 * A number as a GLSL float literal. GLSL ES has no int-to-float promotion, so
 * `vec2 * 1` fails to compile where `vec2 * 1.0` works.
 */
export function glslFloat(value: number): string {
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}
