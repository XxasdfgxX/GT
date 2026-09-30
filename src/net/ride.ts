/** Nearest traffic car the local player is allowed to enter. */

export interface OpenCar {
  id: number;
  x: number;
  z: number;
  driver: number;
}

export function nearestOpenCar(
  cars: readonly OpenCar[],
  x: number,
  z: number,
): { id: number; distance: number } | null {
  let best: { id: number; distance: number } | null = null;
  for (const car of cars) {
    if (car.driver !== 0) continue;
    const distance = Math.hypot(car.x - x, car.z - z);
    if (!best || distance < best.distance) best = { id: car.id, distance };
  }
  return best;
}
