/** Shared PBR surfaces. Color maps are sRGB; the other maps stay linear. */

import {
  CanvasTexture,
  CompressedTexture,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type BufferGeometry,
  type Texture,
} from 'three';
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { AssetManager } from '../../assets/asset-manager';
import type { SurfaceFinish } from '../renderer';
import { scaleBoxUv } from './uv-meters';

/** Meters one texture repeat covers: the real size of each scan, from its Poly Haven info. */
export const TILE_METERS: Record<SurfaceFinish, number> = {
  asphalt: 3,
  concrete: 2.5,
  sidewalk: 3,
  sand: 1.5,
  grass: 2,
  paint: 3,
  lane: 1,
  plaza: 2.12,
  rock: 15,
  dirt: 2,
  brick: 1.4,
  tile: 1.5,
  'concrete-raw': 4,
  'roof-concrete': 3,
  'roof-clay': 2.5,
};

const folders: Record<Exclude<SurfaceFinish, 'lane'>, string> = {
  asphalt: 'asphalt',
  concrete: 'concrete',
  sidewalk: 'sidewalk',
  sand: 'sand',
  grass: 'grass',
  paint: 'plaster',
  plaza: 'plaza',
  rock: 'rock',
  dirt: 'dirt',
  brick: 'brick',
  tile: 'tile',
  'concrete-raw': 'concrete-raw',
  'roof-concrete': 'roof-concrete',
  'roof-clay': 'roof-clay',
};

const envIntensity: Record<SurfaceFinish, number> = {
  asphalt: 0.28,
  concrete: 0.35,
  sidewalk: 0.22,
  sand: 0.22,
  grass: 0.18,
  paint: 0.5,
  lane: 0.15,
  plaza: 0.22,
  rock: 0.2,
  dirt: 0.15,
  brick: 0.3,
  tile: 0.6,
  'concrete-raw': 0.35,
  'roof-concrete': 0.3,
  'roof-clay': 0.3,
};

interface SurfaceMaps {
  color: Texture | null;
  normal: Texture | null;
  roughness: Texture | null;
  ao: Texture | null;
}

export class MaterialLibrary {
  private readonly loader = new TextureLoader();
  private readonly maps = new Map<SurfaceFinish, SurfaceMaps>();
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private bytes = 0;
  private waves: Texture | null = null;

  /** `ktx2` loads the GPU-compressed copy beside each JPG; without it, or if it fails, the JPG. */
  constructor(
    private readonly assets: AssetManager,
    private readonly anisotropy: number,
    private readonly ktx2: KTX2Loader | null = null,
  ) {}

  /** Color and normal of a loaded surface, for materials that sample it themselves. */
  surface(finish: SurfaceFinish): { color: Texture; normal: Texture } | null {
    const maps = this.maps.get(finish);
    if (!maps?.color || !maps.normal) return null;
    return { color: maps.color, normal: maps.normal };
  }

  /** Tileable wave normals from scripts/make-water-normal.mjs. */
  waterNormal(): Texture | null {
    return this.waves;
  }

  byteSize(): number {
    return this.bytes;
  }

  async load(): Promise<void> {
    const finishes = Object.keys(folders) as Array<Exclude<SurfaceFinish, 'lane'>>;
    const [, waves] = await Promise.all([
      Promise.all(finishes.map((finish) => this.loadFinish(finish))),
      this.loadMap('/assets/textures/water/normal.jpg', false),
    ]);
    this.waves = waves;
    this.maps.set('lane', {
      color: this.laneTexture(),
      normal: null,
      roughness: null,
      ao: null,
    });
  }

  resolve(finish: SurfaceFinish, tint: number): MeshStandardMaterial {
    const key = finish === 'paint' ? `paint:${tint}` : finish;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const material = this.assets.track(this.create(finish, finish === 'paint' ? tint : 0xffffff));
    this.materials.set(key, material);
    return material;
  }

  private async loadFinish(finish: Exclude<SurfaceFinish, 'lane'>): Promise<void> {
    const folder = folders[finish];
    const [color, normal, roughness, ao] = await Promise.all([
      this.loadMap(`/assets/textures/${folder}/color.jpg`, true),
      this.loadMap(`/assets/textures/${folder}/normal.jpg`, false),
      this.loadMap(`/assets/textures/${folder}/roughness.jpg`, false),
      this.loadMap(`/assets/textures/${folder}/ao.jpg`, false),
    ]);
    this.maps.set(finish, { color, normal, roughness, ao });
  }

  private async loadMap(url: string, colorMap: boolean): Promise<Texture | null> {
    try {
      const texture = await this.loadCompressed(url).catch(() => this.loader.loadAsync(url));
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.anisotropy = this.anisotropy;
      texture.colorSpace = colorMap ? SRGBColorSpace : NoColorSpace;
      this.bytes += textureBytes(texture);
      return this.assets.track(texture);
    } catch {
      return null;
    }
  }

  private loadCompressed(url: string): Promise<Texture> {
    if (!this.ktx2) return Promise.reject(new Error('sem KTX2'));
    return this.ktx2.loadAsync(url.replace(/\.jpg$/, '.ktx2'));
  }

  private laneTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#f4f1e8';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'rgba(40, 36, 28, 0.16)';
      for (let y = 4; y < canvas.height; y += 11) context.fillRect(2, y, canvas.width - 4, 2);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.anisotropy = this.anisotropy;
    this.bytes += canvas.width * canvas.height * 4;
    return this.assets.track(texture);
  }

  private create(finish: SurfaceFinish, tint: number): MeshStandardMaterial {
    const maps = this.maps.get(finish);
    const material = new MeshStandardMaterial({
      color: tint,
      map: maps?.color ?? null,
      normalMap: maps?.normal ?? null,
      roughnessMap: maps?.roughness ?? null,
      aoMap: maps?.ao ?? null,
      roughness: 1,
      metalness: 0,
      envMapIntensity: envIntensity[finish],
      aoMapIntensity: maps?.ao ? 0.85 : 0,
    });
    if (finish === 'lane' || finish === 'asphalt') {
      material.polygonOffset = true;
      material.polygonOffsetFactor = finish === 'lane' ? -4 : -1;
      material.polygonOffsetUnits = finish === 'lane' ? -4 : -1;
    }
    if (finish === 'sidewalk') material.normalScale.set(1.4, 1.4);
    return material;
  }
}

export function tileBoxUvs(
  geometry: BufferGeometry,
  sx: number,
  sy: number,
  sz: number,
  tile: number,
): void {
  // three r152+ samples the AO map on channel 0, this same uv. No uv2 copy needed.
  const uv = geometry.getAttribute('uv');
  const array = uv?.array;
  if (!(array instanceof Float32Array)) return;
  scaleBoxUv(array, array, sx, sy, sz, tile);
  uv.needsUpdate = true;
}

/** Video memory for the top level: compressed blocks take about a byte a texel, RGBA four. */
function textureBytes(texture: Texture): number {
  const image = texture.image as { width?: number; height?: number } | null;
  if (!image?.width || !image.height) return 0;
  return image.width * image.height * (texture instanceof CompressedTexture ? 1 : 4);
}
