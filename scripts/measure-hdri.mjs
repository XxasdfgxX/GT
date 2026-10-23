// Measures each sky HDRI for src/engine/render/sky.ts: where its sun (or moon) is, the
// horizon color, and the mean brightness of the upper half.
// Run: node scripts/measure-hdri.mjs <file.hdr> ...

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { FloatType } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const loader = new HDRLoader().setDataType(FloatType);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const hex = (r, g, b) =>
  '0x' +
  [r, g, b]
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, toSrgb(c))) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

for (const file of process.argv.slice(2)) {
  const buffer = readFileSync(file);
  const { width, height, data } = loader.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  let best = -1;
  let at = 0;
  let sum = 0;
  let weight = 0;
  const band = [0, 0, 0];
  let bandCount = 0;
  for (let row = 0; row < height; row += 1) {
    // Row 0 is the top of the image, the zenith.
    const elevation = (0.5 - (row + 0.5) / height) * Math.PI;
    for (let col = 0; col < width; col += 1) {
      const i = (row * width + col) * 4;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (lum > best) {
        best = lum;
        at = row * width + col;
      }
      if (elevation > 0) {
        const w = Math.cos(elevation);
        sum += lum * w;
        weight += w;
      }
      if (elevation > 0.01 && elevation < 0.06) {
        band[0] += data[i];
        band[1] += data[i + 1];
        band[2] += data[i + 2];
        bandCount += 1;
      }
    }
  }
  const row = Math.floor(at / width);
  const col = at % width;
  console.log(
    JSON.stringify({
      file: basename(file),
      width,
      height,
      peak: Math.round(best),
      u: +((col + 0.5) / width).toFixed(4),
      elevationDeg: +((0.5 - (row + 0.5) / height) * 180).toFixed(2),
      meanUpper: +(sum / weight).toFixed(4),
      horizon: hex(band[0] / bandCount, band[1] / bandCount, band[2] / bandCount),
    }),
  );
}
