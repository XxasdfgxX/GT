import { describe, expect, it } from 'vitest';
import { createCity } from '../content/city';
import { FACADE_BAYS, FACADE_STYLES, bayCount } from '../content/map/facades';
import { PAINTED_MODELS, PROPS, PROP_MODELS } from '../content/map/props';
import { carModel } from '../content/models';
import { FACADE_WINDOWS } from '../engine/render/materials/facade-shader';

describe('facades', () => {
  // Content may not import the renderer, so the bay widths live twice. Balconies sit on
  // the bays the content counts; windows on the ones the shader counts.
  it('splits walls into the same bays as the shader', () => {
    FACADE_STYLES.forEach((style, index) => {
      expect(FACADE_WINDOWS[index]?.[0]).toBe(FACADE_BAYS[style]);
    });
    expect(bayCount(0.5, 'plaster-grid')).toBe(1);
    expect(bayCount(12, 'plaster-grid')).toBe(4);
  });

  it('gives every building wall a window grid', () => {
    const city = createCity();
    const walls = city.meshes.filter((mesh) => mesh.facade);
    expect(walls.length).toBeGreaterThan(0);
    const withWindows = walls.reduce((sum, mesh) => {
      let lit = 0;
      for (let i = 0; i < mesh.count; i += 1) if ((mesh.facade?.[i * 4] ?? 0) > 0) lit += 1;
      return sum + lit;
    }, 0);
    // A near and a far wall per lot.
    expect(withWindows).toBe(city.footprints.length * 2);
  });
});

describe('street props', () => {
  it('groups model stamps per chunk and url, all of them preloaded', () => {
    const city = createCity();
    const props = city.meshes.filter((mesh) => mesh.kind === 'model');
    const lamps = props.filter((mesh) => mesh.model === PROPS.lamp);
    expect(lamps.reduce((sum, mesh) => sum + mesh.count, 0)).toBeGreaterThan(10);
    const keys = new Set(props.map((mesh) => `${mesh.chunk}|${mesh.model}|${mesh.lod}`));
    expect(keys.size).toBe(props.length);
    for (const mesh of props) expect(PROP_MODELS).toContain(mesh.model);
  });

  it('parks car models with their own paint, and paints nothing else', () => {
    const city = createCity();
    const parked = city.meshes.filter((mesh) => mesh.model === carModel);
    expect(parked.reduce((sum, mesh) => sum + mesh.count, 0)).toBeGreaterThan(5);
    const colors = new Set<string>();
    for (const mesh of parked) {
      for (let i = 0; i < mesh.count; i += 1)
        colors.add(mesh.colors.slice(i * 3, i * 3 + 3).join());
    }
    expect(colors.size).toBeGreaterThan(1);
    expect([...PAINTED_MODELS]).toEqual([carModel]);
  });
});
