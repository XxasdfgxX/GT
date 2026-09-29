import { describe, expect, it } from 'vitest';
import { createWaypoint, nextWaypoint } from '../ui/waypoint';

describe('waypoint', () => {
  it('clears at 12 meters and keeps the point past that', () => {
    const waypoint = createWaypoint();
    waypoint.set({ x: 0, z: 0 });
    if (waypoint.arrived(0, 12)) waypoint.clear();
    expect(waypoint.get()).toBeNull();

    waypoint.set({ x: 0, z: 0 });
    if (waypoint.arrived(0, 12.01)) waypoint.clear();
    expect(waypoint.get()).toEqual({ x: 0, z: 0 });
  });

  it('stores a click when empty and clears when one is already set', () => {
    expect(nextWaypoint(null, { x: 4, z: 8 })).toEqual({ x: 4, z: 8 });
    expect(nextWaypoint({ x: 4, z: 8 }, { x: 1, z: 2 })).toBeNull();
  });
});
