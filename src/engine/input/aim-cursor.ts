/** Pixel cursor clamped to the view. Orbiting leaves it in place. */

export function stepAimCursor(
  x: number,
  y: number,
  dx: number,
  dy: number,
  width: number,
  height: number,
  orbiting: boolean,
): { x: number; y: number } {
  if (orbiting) return { x, y };
  return {
    x: clamp(x + dx, 0, Math.max(width, 0)),
    y: clamp(y + dy, 0, Math.max(height, 0)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
