import { describe, expect, it } from 'vitest';
import { MissionPhase } from '../game/play/mission';
import { atlasPixel, missionBlip, northMarker, radarBlip, radarBounds } from '../ui/radar-map';

describe('radar map', () => {
  it('puts north above south on the baked atlas', () => {
    const bounds = radarBounds();
    const north = atlasPixel(0, bounds.maxZ - 10, bounds, 100);
    const south = atlasPixel(0, bounds.minZ + 10, bounds, 100);
    expect(north.v).toBeLessThan(south.v);
    expect(north.u).toBeCloseTo(south.u, 5);
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
});
