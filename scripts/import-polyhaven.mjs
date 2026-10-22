// Turns Poly Haven 2K downloads into the 1K surface maps the game loads.
// Run: node scripts/import-polyhaven.mjs  (reads tmp/assets-src/polyhaven, writes public/assets/textures)

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const source = 'tmp/assets-src/polyhaven/textures';
const target = 'public/assets/textures';

/**
 * Game folder, Poly Haven slot and id. `white` takes the color out of the albedo and
 * lifts it, so the per-building tint decides the paint. Grass stays ambientCG Grass001:
 * Poly Haven's lawns are dry and leafy, wrong for the coast.
 */
const surfaces = [
  { folder: 'asphalt', slot: 'asphalt_road', id: 'asphalt_02' },
  { folder: 'concrete', slot: 'road_curb_concrete', id: 'brushed_concrete' },
  { folder: 'sidewalk', slot: 'sidewalk_paving', id: 'large_square_pattern_01' },
  { folder: 'sand', slot: 'beach_sand', id: 'sand_01' },
  { folder: 'plaster', slot: 'wall_plaster', id: 'beige_wall_001', white: true },
  { folder: 'rock', slot: 'hill_rock_terrain', id: 'coast_sand_rocks_02' },
  { folder: 'dirt', slot: 'dirt_empty_lot', id: 'red_laterite_soil_stones' },
  { folder: 'plaza', slot: 'plaza_paving', id: 'pavement_02' },
  { folder: 'concrete-raw', slot: 'wall_concrete_raw', id: 'concrete' },
  { folder: 'brick', slot: 'wall_brick_red', id: 'red_brick' },
  { folder: 'tile', slot: 'wall_ceramic_tiles', id: 'floor_tiles_08' },
  { folder: 'roof-concrete', slot: 'roof_flat_concrete', id: 'concrete_floor_worn_001' },
  { folder: 'roof-clay', slot: 'roof_clay_tiles', id: 'clay_roof_tiles_02' },
];

const maps = [
  { suffix: 'diff', name: 'color', quality: 85 },
  { suffix: 'nor_gl', name: 'normal', quality: 92 },
  { suffix: 'rough', name: 'roughness', quality: 85 },
  { suffix: 'ao', name: 'ao', quality: 85 },
];

for (const surface of surfaces) {
  const from = join(source, surface.slot, surface.id);
  const to = join(target, surface.folder);
  mkdirSync(to, { recursive: true });
  for (const map of maps) {
    let image = sharp(join(from, `${surface.id}_${map.suffix}_2k.jpg`)).resize(1024, 1024);
    if (surface.white && map.name === 'color') {
      // sharp orders operations itself, so the lift runs on a second pass after the stretch.
      const gray = await image.grayscale().normalise({ lower: 2, upper: 99 }).toBuffer();
      image = sharp(gray).linear(0.25, 200);
    }
    await image.jpeg({ quality: map.quality, mozjpeg: true }).toFile(join(to, `${map.name}.jpg`));
  }
  console.log(`${surface.folder} <- ${surface.id}`);
}
