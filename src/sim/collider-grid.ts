/** Tall city boxes bucketed on a grid, so a body only tests the boxes around it. */

import type { BoxCollider } from '../content/map/batch';

/** Boxes shorter than this are curbs: bodies and cars pass over them. */
export const TALL_BOX = 0.4;

const CELL = 16;

interface Grid {
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  /** Cell c holds items[start[c] .. start[c + 1]). */
  start: Int32Array;
  items: Int32Array;
  /** Query number that last returned each box, so a box in two cells comes back once. */
  seen: Uint32Array;
}

const grids = new WeakMap<readonly BoxCollider[], Grid>();
const found: BoxCollider[] = [];
let query = 0;

/**
 * Tall boxes whose bounding circle reaches a circle of `reach` around (x, z).
 * Every box that can touch the circle is included. The array is reused: read it
 * before the next call.
 */
export function tallBoxesNear(
  boxes: readonly BoxCollider[],
  x: number,
  z: number,
  reach: number,
): readonly BoxCollider[] {
  const grid = gridFor(boxes);
  found.length = 0;
  query += 1;
  const c0 = clampCell(Math.floor((x - reach - grid.minX) / CELL), grid.cols);
  const c1 = clampCell(Math.floor((x + reach - grid.minX) / CELL), grid.cols);
  const r0 = clampCell(Math.floor((z - reach - grid.minZ) / CELL), grid.rows);
  const r1 = clampCell(Math.floor((z + reach - grid.minZ) / CELL), grid.rows);
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      const cell = row * grid.cols + col;
      for (let k = grid.start[cell] ?? 0; k < (grid.start[cell + 1] ?? 0); k += 1) {
        const index = grid.items[k] ?? 0;
        if (grid.seen[index] === query) continue;
        grid.seen[index] = query;
        const box = boxes[index];
        if (!box) continue;
        const room = reach + Math.hypot(box.hx, box.hz);
        const dx = box.x - x;
        const dz = box.z - z;
        if (dx * dx + dz * dz <= room * room) found.push(box);
      }
    }
  }
  return found;
}

function clampCell(cell: number, count: number): number {
  return Math.min(count - 1, Math.max(0, cell));
}

function gridFor(boxes: readonly BoxCollider[]): Grid {
  const cached = grids.get(boxes);
  if (cached) return cached;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const box of boxes) {
    const radius = Math.hypot(box.hx, box.hz);
    minX = Math.min(minX, box.x - radius);
    minZ = Math.min(minZ, box.z - radius);
    maxX = Math.max(maxX, box.x + radius);
    maxZ = Math.max(maxZ, box.z + radius);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minZ = 0;
    maxX = 0;
    maxZ = 0;
  }
  const cols = Math.max(1, Math.ceil((maxX - minX) / CELL) + 1);
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / CELL) + 1);
  const counts = new Int32Array(cols * rows + 1);
  const visit = (index: number, add: (cell: number) => void) => {
    const box = boxes[index];
    if (!box || box.hy < TALL_BOX) return;
    const radius = Math.hypot(box.hx, box.hz);
    const c0 = clampCell(Math.floor((box.x - radius - minX) / CELL), cols);
    const c1 = clampCell(Math.floor((box.x + radius - minX) / CELL), cols);
    const r0 = clampCell(Math.floor((box.z - radius - minZ) / CELL), rows);
    const r1 = clampCell(Math.floor((box.z + radius - minZ) / CELL), rows);
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) add(row * cols + col);
    }
  };
  for (let index = 0; index < boxes.length; index += 1) {
    visit(index, (cell) => {
      counts[cell + 1] = (counts[cell + 1] ?? 0) + 1;
    });
  }
  for (let cell = 0; cell < cols * rows; cell += 1) {
    counts[cell + 1] = (counts[cell + 1] ?? 0) + (counts[cell] ?? 0);
  }
  const start = counts.slice();
  const fill = counts.slice();
  const items = new Int32Array(start[cols * rows] ?? 0);
  for (let index = 0; index < boxes.length; index += 1) {
    visit(index, (cell) => {
      const slot = fill[cell] ?? 0;
      items[slot] = index;
      fill[cell] = slot + 1;
    });
  }
  const grid: Grid = { minX, minZ, cols, rows, start, items, seen: new Uint32Array(boxes.length) };
  grids.set(boxes, grid);
  return grid;
}
