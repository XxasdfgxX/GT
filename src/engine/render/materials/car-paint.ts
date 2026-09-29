/** Clearcoat, glass, lamps, and tires for the Quaternius car. Materials are cached per renderer. */

import {
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Material,
  type Object3D,
} from 'three';
import type { AssetManager } from '../../assets/asset-manager';

export function dressCar(root: Object3D, assets: AssetManager, cache: Map<string, Material>): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const wheel = /wheel/i.test(object.name);
    const source = object.material as Material | Material[];
    if (Array.isArray(source)) {
      const next = source.map((material) => replaceCarMaterial(material, wheel, assets, cache));
      object.material = next;
      return;
    }
    object.material = replaceCarMaterial(source, wheel, assets, cache);
  });
}

function replaceCarMaterial(
  source: Material,
  wheel: boolean,
  assets: AssetManager,
  cache: Map<string, Material>,
): Material {
  if (!(source instanceof MeshStandardMaterial)) return source;
  const key = `${wheel ? 'wheel' : 'body'}:${source.name}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const created = createCarMaterial(source, wheel);
  if (created === source) return source;
  cache.set(key, assets.track(created));
  return created;
}

function createCarMaterial(source: MeshStandardMaterial, wheel: boolean): Material {
  if (source.name === 'Blue') {
    return new MeshPhysicalMaterial({
      color: source.color.clone(),
      metalness: 0.62,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.3,
    });
  }
  if (source.name === 'Windows') {
    return new MeshPhysicalMaterial({
      color: 0xd7eef4,
      metalness: 0,
      roughness: 0.04,
      transmission: 1,
      thickness: 0.35,
      ior: 1.5,
      envMapIntensity: 1.1,
    });
  }
  if (source.name === 'Headlights') {
    return new MeshStandardMaterial({
      color: 0xfff6d8,
      emissive: 0xfff1c2,
      emissiveIntensity: 4,
      roughness: 0.18,
      metalness: 0,
    });
  }
  if (source.name === 'TailLights') {
    return new MeshStandardMaterial({
      color: 0xff2418,
      emissive: 0xff1c12,
      emissiveIntensity: 4.5,
      roughness: 0.22,
      metalness: 0,
    });
  }
  if (wheel && source.name === 'Black') {
    return new MeshStandardMaterial({ color: 0x141414, roughness: 0.94, metalness: 0 });
  }
  if (wheel && source.name === 'Grey') {
    return new MeshStandardMaterial({ color: 0xb7bcc4, roughness: 0.32, metalness: 0.86 });
  }
  return source;
}
