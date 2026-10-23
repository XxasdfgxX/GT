/** How busy the streets are by the hour, as a share of the full crowd and traffic. Never 0. */

/** Hours and shares, wrapping at midnight. */
const WALKERS = [
  [0, 0.3],
  [4, 0.2],
  [6, 0.45],
  [8, 1],
  [12, 0.85],
  [17.5, 1],
  [20, 0.8],
  [22, 0.5],
  [24, 0.3],
] as const;

const CARS = [
  [0, 0.4],
  [4, 0.3],
  [6.5, 0.7],
  [8, 1],
  [11, 0.8],
  [17.5, 1],
  [20, 0.75],
  [23, 0.5],
  [24, 0.4],
] as const;

function along(table: readonly (readonly [number, number])[], hours: number): number {
  const wrapped = ((hours % 24) + 24) % 24;
  for (let i = 1; i < table.length; i += 1) {
    const [h1, v1] = table[i] ?? [24, 1];
    const [h0, v0] = table[i - 1] ?? [0, 1];
    if (wrapped <= h1) return v0 + ((v1 - v0) * (wrapped - h0)) / Math.max(1e-6, h1 - h0);
  }
  return table[table.length - 1]?.[1] ?? 1;
}

/** Share of the full crowd out walking: rush hours full, the small hours a fifth. */
export function walkerShare(hours: number): number {
  return along(WALKERS, hours);
}

/** Share of the full traffic on the road. */
export function trafficShare(hours: number): number {
  return along(CARS, hours);
}
