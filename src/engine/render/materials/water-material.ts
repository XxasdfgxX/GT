/** Open sea: deep teal under a glossy coat, two wave layers drifting across each other. */

import { MeshPhysicalMaterial, RepeatWrapping, Vector2, type Texture } from 'three';

export interface Water {
  material: MeshPhysicalMaterial;
  /** The wave copies, for the asset manager to own. */
  textures: readonly Texture[];
  /** Seconds since the scene started. */
  tick(time: number): void;
}

/** `sx` and `sz` are the water box size in meters; the waves repeat every 9 m and 23 m. */
export function createWater(normal: Texture, sx: number, sz: number): Water {
  const swell = waves(normal, sx / 9, sz / 9);
  const chop = waves(normal, sx / 23, sz / 23);
  // No metalness: the sky only shows where the angle is low, as on real water.
  const material = new MeshPhysicalMaterial({
    color: 0x0b4f63,
    roughness: 0.08,
    metalness: 0,
    normalMap: swell,
    normalScale: new Vector2(0.35, 0.35),
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    clearcoatNormalMap: chop,
    clearcoatNormalScale: new Vector2(0.5, 0.5),
    envMapIntensity: 1.2,
  });
  return {
    material,
    textures: [swell, chop],
    tick(time) {
      swell.offset.set(time * 0.012, time * 0.007);
      chop.offset.set(-time * 0.004, time * 0.009);
    },
  };
}

function waves(normal: Texture, repeatX: number, repeatZ: number): Texture {
  const copy = normal.clone();
  copy.wrapS = RepeatWrapping;
  copy.wrapT = RepeatWrapping;
  copy.repeat.set(repeatX, repeatZ);
  copy.needsUpdate = true;
  return copy;
}
