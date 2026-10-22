// Writes a tileable wave normal map for the sea: public/assets/textures/water/normal.jpg.
// Run: node scripts/make-water-normal.mjs

import { Buffer } from 'node:buffer';
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const size = 512;
const strength = 24;

// A fixed seed, so the file only changes when this script does.
let seed = 7;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

// Whole-number wave vectors keep every wave seamless across the tile edge.
const waves = [];
while (waves.length < 48) {
  const kx = Math.floor(random() * 19) - 9;
  const ky = Math.floor(random() * 19) - 9;
  if (kx === 0 && ky === 0) continue;
  waves.push({ kx, ky, amplitude: 1 / Math.hypot(kx, ky) ** 1.3, phase: random() * Math.PI * 2 });
}

const height = new Float64Array(size * size);
for (let row = 0; row < size; row += 1) {
  for (let col = 0; col < size; col += 1) {
    const x = (col / size) * Math.PI * 2;
    const y = (row / size) * Math.PI * 2;
    let h = 0;
    for (const wave of waves)
      h += wave.amplitude * Math.sin(wave.kx * x + wave.ky * y + wave.phase);
    height[row * size + col] = h;
  }
}

const at = (row, col) => height[((row + size) % size) * size + ((col + size) % size)];
const pixels = Buffer.alloc(size * size * 3);
for (let row = 0; row < size; row += 1) {
  for (let col = 0; col < size; col += 1) {
    const dx = (at(row, col + 1) - at(row, col - 1)) * 0.5 * strength;
    const dy = (at(row + 1, col) - at(row - 1, col)) * 0.5 * strength;
    const length = Math.hypot(dx, dy, 1);
    const o = (row * size + col) * 3;
    pixels[o] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
    pixels[o + 1] = Math.round(((dy / length) * 0.5 + 0.5) * 255);
    pixels[o + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
  }
}

mkdirSync('public/assets/textures/water', { recursive: true });
await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
  .jpeg({ quality: 92 })
  .toFile('public/assets/textures/water/normal.jpg');
