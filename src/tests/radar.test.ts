import { describe, expect, it } from 'vitest';
import { MissionPhase } from '../game/play/mission';
import {
  atlasPixel,
  drawRadar,
  missionBlip,
  northMarker,
  radarBlip,
  radarBounds,
  radarOffset,
  worldFromAtlas,
  type RadarMap,
} from '../ui/radar-map';

function recordRadar(): { ctx: CanvasRenderingContext2D; fills: string[] } {
  const fills: string[] = [];
  const bag: Record<string, unknown> = {};
  const ctx = new Proxy(bag, {
    get(target, prop) {
      if (prop === 'createRadialGradient') {
        return () => ({ addColorStop() {} });
      }
      if (prop in target) return target[prop as string];
      return () => {};
    },
    set(target, prop, value) {
      if (prop === 'fillStyle' && typeof value === 'string') fills.push(value);
      target[prop as string] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills };
}

describe('radar map', () => {
  it('puts north above south on the baked atlas', () => {
    const bounds = radarBounds();
    const north = atlasPixel(0, bounds.maxZ - 10, bounds, 100);
    const south = atlasPixel(0, bounds.minZ + 10, bounds, 100);
    expect(north.v).toBeLessThan(south.v);
    expect(north.u).toBeCloseTo(south.u, 5);
  });

  it('keeps a far route vertex outside the radar rim', () => {
    const far = radarOffset(0, 0, 400, 0, 90, 64);
    expect(Math.hypot(far.x, far.y)).toBeGreaterThan(76);
  });

  it('places a northern blip above the player and clamps a far one to the rim', () => {
    const close = radarBlip(0, 0, 0, 30, 90, 64);
    expect(close.y).toBeLessThan(0);
    expect(close.clamped).toBe(false);

    const far = radarBlip(0, 0, 400, 0, 90, 64);
    expect(far.clamped).toBe(true);
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(76, 5);
  });

  it('puts N on the camera-right when facing east', () => {
    const facingEast = northMarker(90, 90, 90, 70);
    expect(facingEast.x).toBeGreaterThan(90);
    expect(facingEast.y).toBeCloseTo(90, 5);
  });

  it('parks N at the top when facing north and at the bottom when facing south', () => {
    const facingNorth = northMarker(0, 90, 90, 70);
    const facingSouth = northMarker(180, 90, 90, 70);
    expect(facingNorth.y).toBeLessThan(90);
    expect(facingNorth.x).toBeCloseTo(90, 5);
    expect(facingSouth.y).toBeGreaterThan(90);
    expect(facingSouth.x).toBeCloseTo(90, 5);
  });

  it('points the mission blip at the crate, then the dropoff', () => {
    const pickup = missionBlip(MissionPhase.Pickup);
    const dropoff = missionBlip(MissionPhase.Deliver);
    expect(pickup?.z).toBeGreaterThan(dropoff?.z ?? 0);
    expect(missionBlip(MissionPhase.Done)).toBeNull();
  });

  it('draws a red peer dot and skips it when the list is empty', () => {
    const map: RadarMap = {
      image: {} as HTMLCanvasElement,
      bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 },
    };
    const empty = recordRadar();
    drawRadar(empty.ctx, map, 0, 0, 0, null, 1, null, null, []);
    expect(empty.fills).not.toContain('#e23b3b');

    const marked = recordRadar();
    drawRadar(marked.ctx, map, 0, 0, 0, null, 1, null, null, [{ x: 20, z: 20 }]);
    expect(marked.fills).toContain('#e23b3b');
  });

  it('round-trips a world point through the atlas', () => {
    const bounds = radarBounds();
    const pixel = atlasPixel(120, -40, bounds, 1024);
    const world = worldFromAtlas(pixel.u, pixel.v, bounds, 1024);
    expect(world.x).toBeCloseTo(120, 4);
    expect(world.z).toBeCloseTo(-40, 4);
  });
});
