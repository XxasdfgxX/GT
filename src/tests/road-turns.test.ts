import { describe, expect, it } from 'vitest';
import { exitsAhead, type TurnSpan } from '../content/map/roads';

// A crossroads at node 1, plus a road doubling back to the south-west.
const nodes = new Map([
  [0, { x: -10, z: 0 }],
  [1, { x: 0, z: 0 }],
  [2, { x: 10, z: 0 }],
  [3, { x: 0, z: 10 }],
  [4, { x: -8, z: -2 }],
  [5, { x: 0, z: -10 }],
]);
const at = (id: number) => nodes.get(id);

describe('ways on at a node', () => {
  it('keeps straight and right angles, drops the hairpin and the road itself', () => {
    const spans: TurnSpan[] = [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
      { a: 1, b: 3 },
      { a: 1, b: 4 },
    ];
    const exits = exitsAhead(spans, at, 0, 0);
    expect(exits.map((exit) => exit.edge).sort()).toEqual([1, 2]);
    expect(exits.find((exit) => exit.edge === 1)?.straightness).toBeCloseTo(1, 5);
  });

  it('enters a one-way road only from its start', () => {
    const spans: TurnSpan[] = [
      { a: 0, b: 1 },
      { a: 5, b: 1, oneWay: true },
      { a: 1, b: 3, oneWay: true },
    ];
    expect(exitsAhead(spans, at, 0, 0)).toEqual([{ edge: 2, dir: 0, straightness: 0 }]);
  });
});
