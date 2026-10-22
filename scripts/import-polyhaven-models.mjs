// Turns Poly Haven 1K glTF downloads into the street props the game instances.
// Run: node scripts/import-polyhaven-models.mjs  (reads tmp/assets-src/polyhaven, writes public/assets/props)

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const source = 'tmp/assets-src/polyhaven/models';
const target = 'public/assets/props';

/** Game name, Poly Haven slot and id, and the share of vertices kept (1 keeps the mesh). */
const props = [
  { name: 'street-lamp', slot: 'street_lamp', id: 'street_lamp_01', keep: 0.25 },
  { name: 'trash-can', slot: 'trash_can', id: 'metal_trash_can', keep: 0.3 },
  { name: 'bench', slot: 'bench', id: 'modular_street_seating', keep: 0.25 },
  { name: 'hydrant', slot: 'fire_hydrant', id: 'fire_hydrant', keep: 0.04 },
  { name: 'utility-box', slot: 'utility_box', id: 'utility_box_02', keep: 1 },
  { name: 'barrier', slot: 'concrete_barrier', id: 'concrete_road_barrier_02', keep: 0.17 },
  { name: 'potted-plant', slot: 'potted_plant', id: 'potted_plant_04', keep: 1 },
  { name: 'shrub', slot: 'shrub', id: 'shrub_04', keep: 0.2 },
  { name: 'planter', slot: 'planter_box', id: 'planter_box_01', keep: 1 },
  { name: 'crate', slot: 'plastic_crates', id: 'plastic_crate_01', keep: 0.12 },
  { name: 'fern', slot: 'tropical_plant', id: 'fern_02', keep: 1 },
];

mkdirSync(target, { recursive: true });
for (const prop of props) {
  const input = join(source, prop.slot, prop.id, `${prop.id}_1k.gltf`);
  const output = join(target, `${prop.name}.glb`);
  const simplify =
    prop.keep < 1
      ? ['--simplify', 'true', '--simplify-ratio', String(prop.keep), '--simplify-error', '0.01']
      : ['--simplify', 'false'];
  execFileSync(
    'pnpm',
    [
      'exec',
      'gltf-transform',
      'optimize',
      input,
      output,
      '--compress',
      'meshopt',
      '--texture-compress',
      'webp',
      '--texture-size',
      '1024',
      ...simplify,
    ],
    { stdio: 'inherit', shell: true },
  );
  console.log(`${prop.name} <- ${prop.id}`);
}
