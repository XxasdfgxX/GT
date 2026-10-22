/** HDRI background and image-based lighting. Textures are owned by the asset manager. */

import {
  EquirectangularReflectionMapping,
  FogExp2,
  PMREMGenerator,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import type { AssetManager } from '../assets/asset-manager';
import { COAST_HDRI_URL, HORIZON_COLOR } from './sky';

const pmremBytes = 256 * 256 * 6 * 4;

export async function loadCoastEnvironment(
  renderer: WebGLRenderer,
  scene: Scene,
  assets: AssetManager,
): Promise<number> {
  const hdr = await new HDRLoader().loadAsync(COAST_HDRI_URL);
  hdr.mapping = EquirectangularReflectionMapping;
  assets.track(hdr);

  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(hdr);
  assets.track(target);
  pmrem.dispose();

  scene.background = hdr;
  scene.environment = target.texture;
  const fog = scene.fog;
  if (fog instanceof FogExp2) fog.color.setHex(HORIZON_COLOR);

  const image = hdr.image as { width?: number; height?: number } | null;
  const hdrBytes = image && image.width && image.height ? image.width * image.height * 4 : 0;
  return hdrBytes + pmremBytes;
}
