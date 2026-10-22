// Recompresses the textures inside public/assets/props/*.glb as KTX2 (KHR_texture_basisu).
// Run: node scripts/encode-props-ktx2.mjs [name.glb ...]  (after import-polyhaven-models.mjs; no names = all)

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const folder = 'public/assets/props';

const imageDecoder = async (buffer) => {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// glTF textures are not flipped by the loader, so unlike the surface maps these keep their rows.
const shared = { generateMipmap: true, isKTX2File: true, compressionLevel: 2, imageDecoder };
const only = process.argv.slice(2);
const files = only.length > 0 ? only : readdirSync(folder).filter((name) => name.endsWith('.glb'));
for (const file of files) {
  const path = join(folder, file);
  const document = await io.read(path);
  await document.transform(
    ktx2({
      ...shared,
      slots: /^(baseColorTexture|emissiveTexture)$/,
      isUASTC: false,
      qualityLevel: 160,
      isPerceptual: true,
      isSetKTX2SRGBTransferFunc: true,
    }),
    // Props are small on screen: ETC1S normals are a fifth the size of UASTC and look the same there.
    ktx2({
      ...shared,
      slots: /^normalTexture$/,
      isUASTC: false,
      isNormalMap: true,
      qualityLevel: 200,
      isPerceptual: false,
    }),
    ktx2({
      ...shared,
      slots: /^(metallicRoughnessTexture|occlusionTexture)$/,
      isUASTC: false,
      qualityLevel: 128,
      isPerceptual: false,
    }),
  );
  await io.write(path, document);
  console.log(`${file} done`);
}
