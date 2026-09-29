/** Top-down Costa Verde baked once, then cropped into a rotating GTA-style radar. */

import type { CostaVerde } from '../content/city';
import { islandBounds } from '../content/map/island-shape';
import { delivery } from '../content/mission';
import { MissionPhase } from '../game/play/mission';

export const RADAR_SIZE = 180;
export const RADAR_VIEW_RADIUS = 64;

const atlasSize = 1024;
const water = '#1787a8';
const roadPaint = '#d5d8de';
const block = '#f3f0e6';
const sand = '#e7d3a4';
const forest = '#3f7a3a';
const rock = '#8d867c';
const lagoonPaint = '#1a9bb8';

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
  const bounds = islandBounds();
  const pad = 180;
  return {
    minX: bounds.minX - pad,
    maxX: bounds.maxX + pad,
    minZ: bounds.minZ - pad,
    maxZ: bounds.maxZ + pad,
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

/** Radar offset before the heading rotation. Not clamped to the rim. */
export function radarOffset(
  playerX: number,
  playerZ: number,
  x: number,
  z: number,
  radiusPx: number,
  viewRadius: number,
): RadarPoint {
  const scale = radiusPx / viewRadius;
  return {
    x: (x - playerX) * scale,
    y: -(z - playerZ) * scale,
  };
}

export const ROUTE_COLOR = '#7ec8e3';

export function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius, y);
  ctx.closePath();
  ctx.fillStyle = '#f2c14e';
  ctx.strokeStyle = '#1a1408';
  ctx.lineWidth = Math.max(1.5, radius * 0.2);
  ctx.fill();
  ctx.stroke();
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
  const step = 4;
  for (let py = 0; py < atlasSize; py += step) {
    for (let px = 0; px < atlasSize; px += step) {
      const x = bounds.minX + ((px + step / 2) / atlasSize) * (bounds.maxX - bounds.minX);
      const z = bounds.maxZ - ((py + step / 2) / atlasSize) * (bounds.maxZ - bounds.minZ);
      const paint = landColor(city, x, z);
      if (!paint) continue;
      ctx.fillStyle = paint;
      ctx.fillRect(px, py, step, step);
    }
  }

  ctx.strokeStyle = roadPaint;
  ctx.lineCap = 'round';
  for (const edge of city.graph.edges) {
    const a = city.graph.nodes[edge.a];
    const b = city.graph.nodes[edge.b];
    if (!a || !b) continue;
    const from = atlasPixel(a.x, a.z, bounds, atlasSize);
    const to = atlasPixel(b.x, b.z, bounds, atlasSize);
    ctx.lineWidth = edge.kind === 'coast' ? 4 : edge.kind === 'avenue' ? 2.5 : 1.4;
    ctx.beginPath();
    ctx.moveTo(from.u, from.v);
    ctx.lineTo(to.u, to.v);
    ctx.stroke();
  }

  for (const lot of city.footprints) {
    stamp(ctx, bounds, lot.x, lot.z, lot.sx, lot.sz, lot.yaw, block);
  }
  return { image, bounds };
}

function landColor(city: CostaVerde, x: number, z: number): string | undefined {
  if (insideRing(x, z, city.lagoon)) return lagoonPaint;
  if (!insideRing(x, z, city.outline)) return undefined;
  const { terrain } = city;
  const u = (x - terrain.originX) / terrain.sizeX;
  const v = (z - terrain.originZ) / terrain.sizeZ;
  if (u < 0 || v < 0 || u > 1 || v > 1) return forest;
  const ix = Math.min(terrain.cols - 1, Math.floor(u * (terrain.cols - 1)));
  const iz = Math.min(terrain.rows - 1, Math.floor(v * (terrain.rows - 1)));
  const height = terrain.heights[iz * terrain.cols + ix] ?? 0;
  if (height < 1.2) return sand;
  if (height > 70) return rock;
  if (height < 6) return '#6a6e73';
  return forest;
}

function insideRing(x: number, z: number, ring: ReadonlyArray<readonly [number, number]>): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const zi = a[1];
    const zj = b[1];
    if (zi > z !== zj > z && x < ((b[0] - a[0]) * (z - zi)) / (zj - zi || 1e-9) + a[0]) hit = !hit;
  }
  return hit;
}

export function drawRadar(
  ctx: CanvasRenderingContext2D,
  map: RadarMap,
  playerX: number,
  playerZ: number,
  headingDeg: number,
  blip: WorldPoint | null,
  dpr: number,
  route: WorldPoint[] | null = null,
  waypoint: WorldPoint | null = null,
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

  if (route && route.length > 1) {
    ctx.beginPath();
    for (let i = 0; i < route.length; i += 1) {
      const point = route[i];
      if (!point) continue;
      const spot = radarOffset(playerX, playerZ, point.x, point.z, radius, RADAR_VIEW_RADIUS);
      if (i === 0) ctx.moveTo(spot.x, spot.y);
      else ctx.lineTo(spot.x, spot.y);
    }
    ctx.strokeStyle = ROUTE_COLOR;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  if (waypoint) {
    const spot = radarBlip(playerX, playerZ, waypoint.x, waypoint.z, radius, RADAR_VIEW_RADIUS);
    drawPin(ctx, spot.x, spot.y, spot.clamped ? 5 : 6);
  }

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
