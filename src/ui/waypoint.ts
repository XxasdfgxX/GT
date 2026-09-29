/** One map pin for the current session. */

export interface MapPoint {
  x: number;
  z: number;
}

export interface Waypoint {
  get(): MapPoint | null;
  set(point: MapPoint): void;
  clear(): void;
  /** True when a pin is set and the XZ distance is 12 meters or less. */
  arrived(x: number, z: number): boolean;
}

export const ARRIVAL_METERS = 12;

export function createWaypoint(): Waypoint {
  let point: MapPoint | null = null;
  return {
    get: () => point,
    set(next) {
      point = { x: next.x, z: next.z };
    },
    clear() {
      point = null;
    },
    arrived(x, z) {
      if (!point) return false;
      return Math.hypot(x - point.x, z - point.z) <= ARRIVAL_METERS;
    },
  };
}

/** A click stores the point only while no pin is set. Otherwise it clears. */
export function nextWaypoint(current: MapPoint | null, click: MapPoint): MapPoint | null {
  if (current) return null;
  return { x: click.x, z: click.z };
}
