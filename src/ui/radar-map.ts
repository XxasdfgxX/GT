/** Top-down Costa Verde baked once, then cropped into a rotating GTA-style radar. */

import type { CostaVerde } from '../content/city';
import { delivery } from '../content/mission';
import { island, streetPaint, testMap } from '../content/map';
import { MissionPhase } from '../game/play/mission';

export const RADAR_SIZE = 180;
export const RADAR_VIEW_RADIUS = 64;

const atlasSize = 2048;
const water = '#1787a8';
const grass = '#3c7a44';
const roadPaint = '#e6e9ee';
const roadEdge = '#6a7078';
const block = '#f3f0e6';

export interface AtlasBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RadarMap {
  image: HTMLCanvasElement;
  bounds: AtlasBounds;
}

export interface RadarPoint {
  x: number;
  y: number;
}

export interface WorldPoint {
  x: number;
  z: number;
}

export function radarBounds(): AtlasBounds {
  const south = island.centerZ - island.depth / 2;
  const north = island.centerZ + island.depth / 2;
  const pad = 200;
  return {
    minX: -island.width / 2 - pad,
    maxX: island.width / 2 + pad,
    minZ: south - pad,
    maxZ: north + pad,
  };
}

/** Atlas pixel. North is up, so a larger Z is a smaller V. */
export function atlasPixel(
  x: number,
  z: number,
  bounds: AtlasBounds,
  size: number,
): { u: number; v: number } {
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  return {
    u: ((x - bounds.minX) / spanX) * size,
    v: ((bounds.maxZ - z) / spanZ) * size,
  };
}

/** Inverse of atlasPixel. North stays up. */
export function worldFromAtlas(
  u: number,
  v: number,
  bounds: AtlasBounds,
  size: number,
): WorldPoint {
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  return {
    x: bounds.minX + (u / size) * spanX,
    z: bounds.maxZ - (v / size) * spanZ,
  };
}

/** Blip in radar space before the heading rotation. +Y is south. Clamped to the rim. */
export function radarBlip(
  playerX: number,
  playerZ: number,
  blipX: number,
  blipZ: number,
  radiusPx: number,
  viewRadius: number,
): RadarPoint & { clamped: boolean } {
  const scale = radiusPx / viewRadius;
  let x = (blipX - playerX) * scale;
  let y = -(blipZ - playerZ) * scale;
  const len = Math.hypot(x, y);
  const max = radiusPx - 14;
  if (len > max && len > 0) {
    const k = max / len;
    x *= k;
    y *= k;
    return { x, y, clamped: true };
  }
  return { x, y, clamped: false };
}

/** Screen position of the N mark. Heading 0 (facing north) puts N at the top. X is mirrored so it matches the chase camera. */
export function northMarker(headingDeg: number, cx: number, cy: number, orbit: number): RadarPoint {
  const heading = (headingDeg * Math.PI) / 180;
  const angle = -Math.PI / 2 - heading;
  return {
    x: cx - Math.cos(angle) * orbit,
    y: cy + Math.sin(angle) * orbit,
  };
}

export function missionBlip(phase: number): WorldPoint | null {
  if (phase === MissionPhase.Pickup) return { x: delivery.pickup.x, z: delivery.pickup.z };
  if (phase === MissionPhase.Deliver) return { x: delivery.dropoff.x, z: delivery.dropoff.z };
  return null;
}

export function bakeRadarMap(city: CostaVerde): RadarMap {
  const bounds = radarBounds();
  const image = document.createElement('canvas');
  image.width = atlasSize;
  image.height = atlasSize;
  const ctx = image.getContext('2d');
  if (!ctx) return { image, bounds };

  ctx.fillStyle = water;
  ctx.fillRect(0, 0, atlasSize, atlasSize);
  stamp(ctx, bounds, 0, island.centerZ, island.width, island.depth, 0, grass);

  for (const item of city.solids) {
    if (item.surface === 'water') continue;
    if (item.sx < 4 || item.sz < 4) continue;
    if (item.color === streetPaint.asphalt) continue;
    stamp(ctx, bounds, item.x, item.z, item.sx, item.sz, 0, cssColor(item.color));
  }

  for (const batch of city.batches) {
    if (batch.kind !== 'box' || batch.sy < 2.4 || batch.sx < 3 || batch.sz < 3) continue;
    for (let i = 0; i < batch.count; i += 1) {
      const o = i * 16;
      const x = batch.matrices[o + 12];
      const z = batch.matrices[o + 14];
      const c = batch.matrices[o];
      const s = batch.matrices[o + 8];
      if (x === undefined || z === undefined || c === undefined || s === undefined) continue;
      stamp(ctx, bounds, x, z, batch.sx, batch.sz, Math.atan2(s, c), block);
    }
  }

  for (const house of [...testMap.buildings, ...city.houses]) {
    stamp(ctx, bounds, house.x, house.z, house.sx, house.sz, house.yaw, block);
  }

  for (const item of city.solids) {
    if (item.color !== streetPaint.asphalt || item.sx < 4 || item.sz < 4) continue;
    stamp(ctx, bounds, item.x, item.z, item.sx, item.sz, 0, roadPaint);
  }

  for (const road of city.roads) {
    const alongX = road.axis === 'x';
    const length = road.z1 - road.z0;
    const along = (road.z0 + road.z1) / 2;
    const cross = road.x;
    const x = alongX ? along : cross;
    const z = alongX ? cross : along;
    const wide = road.width + 2.4;
    stamp(ctx, bounds, x, z, alongX ? length : wide, alongX ? wide : length, 0, roadEdge);
    stamp(
      ctx,
      bounds,
      x,
      z,
      alongX ? length : road.width,
      alongX ? road.width : length,
      0,
      roadPaint,
    );
  }

  return { image, bounds };
}

export function drawRadar(
  ctx: CanvasRenderingContext2D,
  map: RadarMap,
  playerX: number,
  playerZ: number,
  headingDeg: number,
  blip: WorldPoint | null,
  dpr: number,
): void {
  const radius = RADAR_SIZE / 2;
  const heading = (headingDeg * Math.PI) / 180;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, RADAR_SIZE, RADAR_SIZE);
  ctx.save();
  ctx.beginPath();
  ctx.arc(radius, radius, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(radius, radius);
  ctx.scale(-1, 1);
  ctx.rotate(-heading);

  const spanX = map.bounds.maxX - map.bounds.minX;
  const spanZ = map.bounds.maxZ - map.bounds.minZ;
  const scale = radius / RADAR_VIEW_RADIUS;
  const destW = spanX * scale;
  const destH = spanZ * scale;
  const pu = (playerX - map.bounds.minX) / spanX;
  const pv = (map.bounds.maxZ - playerZ) / spanZ;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(map.image, -pu * destW, -pv * destH, destW, destH);

  const shade = ctx.createRadialGradient(0, 0, radius * 0.45, 0, 0, radius);
  shade.addColorStop(0, 'rgb(0 0 0 / 0%)');
  shade.addColorStop(1, 'rgb(0 0 0 / 32%)');
  ctx.fillStyle = shade;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  if (blip) {
    const spot = radarBlip(playerX, playerZ, blip.x, blip.z, radius, RADAR_VIEW_RADIUS);
    ctx.fillStyle = '#f2c14e';
    ctx.strokeStyle = '#1a1408';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, spot.clamped ? 4 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(radius, radius - 9);
  ctx.lineTo(radius + 5.5, radius + 7);
  ctx.lineTo(radius, radius + 3);
  ctx.lineTo(radius - 5.5, radius + 7);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.25;
  ctx.fill();
  ctx.stroke();
}

function stamp(
  ctx: CanvasRenderingContext2D,
  bounds: AtlasBounds,
  x: number,
  z: number,
  sx: number,
  sz: number,
  yaw: number,
  color: string,
): void {
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const scaleX = atlasSize / spanX;
  const scaleZ = atlasSize / spanZ;
  const origin = atlasPixel(x, z, bounds, atlasSize);
  ctx.save();
  ctx.translate(origin.u, origin.v);
  ctx.rotate(yaw);
  ctx.fillStyle = color;
  ctx.fillRect((-sx / 2) * scaleX, (-sz / 2) * scaleZ, sx * scaleX, sz * scaleZ);
  ctx.restore();
}

function cssColor(hex: number): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgb(${r} ${g} ${b})`;
}
