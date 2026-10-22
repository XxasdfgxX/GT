// Writes a .ktx2 beside every surface map in public/assets/textures, and copies the
// Basis transcoder three's KTX2Loader needs to public/basis/.
// Run: node scripts/encode-ktx2.mjs  (after import-polyhaven.mjs and make-water-normal.mjs)

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';

const root = 'public/assets/textures';

const imageDecoder = async (buffer) => {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

/**
 * Color is sRGB ETC1S. Normals keep their precision in UASTC. Roughness and AO are linear.
 * Every map is flipped: the JPG loader flips V and KTX2 does not, and a normal map read
 * the other way up would light its bumps from the wrong side.
 */
const settings = {
  color: { isUASTC: false, qualityLevel: 160, isPerceptual: true, isSetKTX2SRGBTransferFunc: true },
  normal: {
    isUASTC: true,
    isNormalMap: true,
    isPerceptual: false,
    // Rate-distortion tuning plus Zstandard trims 1-50% per map, more on the smoother ones.
    enableRDO: true,
    rdoQualityLevel: 1.5,
    needSupercompression: true,
  },
  roughness: { isUASTC: false, qualityLevel: 128, isPerceptual: false },
  ao: { isUASTC: false, qualityLevel: 128, isPerceptual: false },
};

for (const folder of readdirSync(root)) {
  for (const [map, options] of Object.entries(settings)) {
    const source = join(root, folder, `${map}.jpg`);
    if (!existsSync(source)) continue;
    const encoded = await encodeToKTX2(new Uint8Array(readFileSync(source)), {
      ...options,
      compressionLevel: 2,
      generateMipmap: true,
      isKTX2File: true,
      isYFlip: true,
      imageDecoder,
    });
    writeFileSync(join(root, folder, `${map}.ktx2`), encoded);
    console.log(`${folder}/${map}.ktx2 ${Math.round(encoded.length / 1024)} KB`);
  }
}

const basis = 'node_modules/three/examples/jsm/libs/basis';
mkdirSync('public/basis', { recursive: true });
for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
  copyFileSync(join(basis, file), join('public/basis', file));
}
