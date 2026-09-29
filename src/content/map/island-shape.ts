/** Stylized Ilha de Santa Catarina: long north-south coast, a lagoon, and serras. */

/** Meters. Clockwise is not required; winding is fixed by the shoelace tests. */
export const islandOutline: ReadonlyArray<readonly [number, number]> = [
  [30, -1060],
  [110, -1000],
  [170, -900],
  [200, -800],
  [220, -680],
  [250, -540],
  [300, -400],
  [330, -260],
  [300, -120],
  [250, -20],
  [230, 80],
  [200, 140],
  [250, 200],
  [310, 300],
  [330, 420],
  [300, 540],
  [340, 640],
  [280, 740],
  [180, 840],
  [60, 880],
  [-40, 820],
  [-120, 720],
  [-200, 640],
  [-280, 540],
  [-320, 440],
  [-260, 340],
  [-230, 220],
  [-250, 100],
  [-270, -20],
  [-250, -140],
  [-200, -280],
  [-160, -420],
  [-100, -560],
  [-20, -720],
  [10, -880],
];

/** Lagoa da Conceição: a long basin east of the city, west of the beach. */
export const lagoonOutline: ReadonlyArray<readonly [number, number]> = [
  [148, 190],
  [188, 210],
  [228, 140],
  [236, 50],
  [220, -20],
  [186, -70],
  [152, -30],
  [140, 40],
  [142, 120],
];

export const CITY_FLOOR = 4;

export interface UrbanZone {
  name: string;
  x: number;
  z: number;
  sx: number;
  sz: number;
  /** dense = Florianópolis basin, town = beach district, beach = orla strip. */
  density: 'dense' | 'town' | 'beach';
}

export const urbanZones: readonly UrbanZone[] = [
  { name: 'centro', x: -70, z: -10, sx: 280, sz: 280, density: 'dense' },
  { name: 'jurere', x: -170, z: 560, sx: 150, sz: 110, density: 'town' },
  { name: 'norte', x: 150, z: 700, sx: 200, sz: 130, density: 'town' },
  { name: 'leste', x: 230, z: -200, sx: 110, sz: 240, density: 'beach' },
  { name: 'sul', x: 20, z: -560, sx: 130, sz: 110, density: 'town' },
];

interface Peak {
  x: number;
  z: number;
  h: number;
  r: number;
}

const peaks: readonly Peak[] = [
  { x: 40, z: 300, h: 118, r: 210 },
  { x: -10, z: 500, h: 72, r: 150 },
  { x: 150, z: 160, h: 96, r: 150 },
  { x: 40, z: -300, h: 58, r: 150 },
  { x: 200, z: 430, h: 64, r: 120 },
];

const blendMargin = 40;

export function pointInPolygon(
  x: number,
  z: number,
  ring: ReadonlyArray<readonly [number, number]>,
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const zi = a[1];
    const zj = b[1];
    const xi = a[0];
    const xj = b[0];
    const hit = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function onIsland(x: number, z: number): boolean {
  return pointInPolygon(x, z, islandOutline) && !pointInPolygon(x, z, lagoonOutline);
}

export function islandBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of islandOutline) {
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minZ = Math.min(minZ, point[1]);
    maxZ = Math.max(maxZ, point[1]);
  }
  return { minX, maxX, minZ, maxZ };
}

function coastDistance(x: number, z: number): number {
  let best = Infinity;
  const ring = islandOutline;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    best = Math.min(best, segmentDistance(x, z, a[0], a[1], b[0], b[1]));
  }
  return best;
}

function segmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function zoneWeight(x: number, z: number, zone: UrbanZone): number {
  const hx = zone.sx / 2;
  const hz = zone.sz / 2;
  const dx = Math.abs(x - zone.x) - hx;
  const dz = Math.abs(z - zone.z) - hz;
  const outside = Math.max(dx, dz);
  if (outside > blendMargin) return 0;
  if (outside > 0) return 1 - outside / blendMargin;
  const edge = Math.min(hx - Math.abs(x - zone.x), hz - Math.abs(z - zone.z));
  if (edge >= blendMargin) return 1;
  return edge / blendMargin;
}

/** 1 inside a flat urban basin, 0 on the serra. */
export function urbanWeight(x: number, z: number): number {
  let weight = 0;
  for (const zone of urbanZones) weight = Math.max(weight, zoneWeight(x, z, zone));
  return weight;
}

export function zoneAt(x: number, z: number): UrbanZone | undefined {
  let best: UrbanZone | undefined;
  let bestW = 0;
  for (const zone of urbanZones) {
    const weight = zoneWeight(x, z, zone);
    if (weight > bestW) {
      bestW = weight;
      best = zone;
    }
  }
  return bestW > 0.5 ? best : undefined;
}

function rawHeight(x: number, z: number): number {
  let height = 1.2;
  // Parque Estadual do Rio Vermelho: the broad green highland north of the city.
  height += ridge(x, z, -10, 150, 100, 480, 112, 145);
  // Morro das Pedras and the southern hills above Campeche.
  height += ridge(x, z, -20, -170, 80, -540, 74, 115);
  // Lower hills between the north beaches.
  height += ridge(x, z, -90, 400, 30, 600, 46, 85);
  for (const peak of peaks) {
    const dx = x - peak.x;
    const dz = z - peak.z;
    height += peak.h * 0.35 * Math.exp(-(dx * dx + dz * dz) / (2 * peak.r * peak.r));
  }
  const n = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 5 + Math.sin(x * 0.008 + z * 0.01) * 3;
  return height + n;
}

function ridge(
  x: number,
  z: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  height: number,
  radius: number,
): number {
  const distance = segmentDistance(x, z, x0, z0, x1, z1);
  return height * Math.exp(-(distance * distance) / (2 * radius * radius));
}

/** Ground height in meters. Below 0 is water (ocean or the lagoon). */
export function sampleHeight(x: number, z: number): number {
  if (pointInPolygon(x, z, lagoonOutline)) return -1.4;
  if (!pointInPolygon(x, z, islandOutline)) return -6;
  const coast = coastDistance(x, z);
  let height = rawHeight(x, z);
  if (coast < 32) height = Math.min(height, 0.45 + coast * 0.03);
  const urban = urbanWeight(x, z);
  if (urban > 0) height = height * (1 - urban) + CITY_FLOOR * urban;
  return height;
}

export function terrainColor(x: number, z: number, height: number): number {
  if (height < 0.15) return 0xc2a36b;
  if (height < 1.3 && coastDistance(x, z) < 36) return 0xe7d3a4;
  if (urbanWeight(x, z) > 0.55 && height < CITY_FLOOR + 1.5) return 0x6a6e73;
  if (height > 78) return 0x8d867c;
  if (height > 48) return 0x5d6a48;
  return 0x3f7a3a;
}
