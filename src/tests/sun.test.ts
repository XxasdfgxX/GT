import { describe, expect, it } from 'vitest';
import { dayLightAt, directionAtTime, equirectU, snapToTexel } from '../engine/render/sun-math';

const at = (hours: number) => hours / 24;

describe('sun', () => {
  it('rises in the east at 06:00, stands high in the north at noon and sets west at 18:00', () => {
    const out = { x: 0, y: 0, z: 0 };
    directionAtTime(at(6), out);
    expect(out.x).toBeCloseTo(1, 4);
    expect(out.y).toBeCloseTo(0, 4);
    directionAtTime(at(12), out);
    expect(out.y).toBeGreaterThan(0.9);
    expect(out.z).toBeLessThan(0);
    directionAtTime(at(18), out);
    expect(out.x).toBeCloseTo(-1, 4);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 6);
  });

  it('is under the ground from sunset to sunrise', () => {
    const out = { x: 0, y: 0, z: 0 };
    for (const hours of [0, 3, 5.5, 18.5, 22]) {
      directionAtTime(at(hours), out);
      expect(out.y).toBeLessThan(0);
    }
  });

  it('snaps shadow samples onto the texel grid', () => {
    expect(snapToTexel(10.2, 0.5)).toBe(10);
    expect(snapToTexel(-1.2, 0.5)).toBe(-1);
  });
});

describe('day light', () => {
  it('shows the day sky at noon and the night sky at midnight', () => {
    const noon = dayLightAt(at(12));
    expect(noon.weights.day).toBe(1);
    expect(noon.nightLight).toBe(0);
    expect(noon.shadows).toBe(true);
    const midnight = dayLightAt(at(0));
    expect(midnight.weights.night).toBe(1);
    expect(midnight.nightLight).toBe(1);
    expect(midnight.light.y).toBeGreaterThan(0.5);
    expect(midnight.lightIntensity).toBeLessThan(0.2);
  });

  it('blends through the sunset sky at dusk, with the weights always summing to 1', () => {
    expect(dayLightAt(at(18)).weights.sunset).toBeGreaterThan(0.9);
    for (let hours = 0; hours < 24; hours += 0.25) {
      const { weights } = dayLightAt(at(hours));
      expect(weights.day + weights.sunset + weights.night).toBeCloseTo(1, 6);
    }
  });

  it('never lights from below the ground, and moves smoothly minute to minute', () => {
    let previous = dayLightAt(0);
    for (let minute = 1; minute <= 24 * 60; minute += 1) {
      const next = dayLightAt(minute / (24 * 60));
      expect(next.light.y).toBeGreaterThanOrEqual(0);
      expect(Math.abs(next.lightIntensity - previous.lightIntensity)).toBeLessThan(0.05);
      expect(Math.abs(next.nightLight - previous.nightLight)).toBeLessThan(0.05);
      previous = next;
    }
  });

  it('turns each sky so its disc lands on its light', () => {
    const noon = dayLightAt(at(12));
    expect(noon.targetU.day).toBeCloseTo(equirectU(noon.light), 6);
    const midnight = dayLightAt(at(0));
    expect(midnight.targetU.night).toBeCloseTo(equirectU(midnight.light), 6);
  });

  it('lights most homes in the evening, few before dawn, and closes shops at 22:00', () => {
    expect(dayLightAt(at(20)).windowShare).toBeCloseTo(0.7, 6);
    expect(dayLightAt(at(4)).windowShare).toBeLessThan(0.25);
    expect(dayLightAt(at(20)).shopShare).toBeCloseTo(0.9, 6);
    expect(dayLightAt(at(23)).shopShare).toBeCloseTo(0.1, 6);
  });
});
