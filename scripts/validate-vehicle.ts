/**
 * Checks a GLB used for traffic: triangle count, wheel nodes, and meter-scale bounds.
 * Run: node --experimental-strip-types scripts/validate-vehicle.ts public/assets/car.glb
 *
 * Raw downloads should be optimized first with gltf-transform (not a runtime dependency):
 * npx @gltf-transform/cli optimize in.glb out.glb --compress draco --texture-size 512
 */

import { readFileSync } from 'node:fs';

interface GltfNode {
  name?: string;
}

interface GltfAccessor {
  count?: number;
  min?: number[];
  max?: number[];
}

interface GltfPrimitive {
  indices?: number;
  attributes?: { POSITION?: number };
}

interface GltfMesh {
  primitives?: GltfPrimitive[];
}

interface GltfJson {
  nodes?: GltfNode[];
  meshes?: GltfMesh[];
  accessors?: GltfAccessor[];
}

const file = process.argv[2] ?? 'public/assets/car.glb';
const strictWheels = process.argv.includes('--strict-wheels');
const json = readGltf(file);
const triangles = countTriangles(json);
const wheels = (json.nodes ?? [])
  .map((node) => node.name ?? '')
  .filter((name) => /wheel/i.test(name));
const bounds = meshBounds(json);

console.log(`${file}`);
console.log(`triangles ${triangles}`);
console.log(`wheels ${wheels.length}: ${wheels.join(', ') || '(none)'}`);
if (bounds) {
  const size = bounds.max.map((value, index) => value - (bounds.min[index] ?? 0));
  console.log(`bounds ${size.map((value) => value.toFixed(2)).join(' x ')} m`);
}

let failed = false;
if (triangles >= 10000) {
  console.error('too many triangles for traffic (limit 10000)');
  failed = true;
}
if (wheels.length < 4) {
  const message =
    'fewer than 4 wheel nodes; the Quaternius car shares a rear axle, so traffic uses the whole model';
  if (strictWheels) {
    console.error(message);
    failed = true;
  } else console.log(message);
}
if (bounds) {
  const longest = Math.max(
    bounds.max[0] - (bounds.min[0] ?? 0),
    bounds.max[2] - (bounds.min[2] ?? 0),
  );
  if (longest > 12 || longest < 1.2) {
    console.error('model is not in meters (expected a car length between 1.2 and 12)');
    failed = true;
  }
}
process.exit(failed ? 1 : 0);

function readGltf(path: string): GltfJson {
  const buf = readFileSync(path);
  const length = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + length).toString()) as GltfJson;
}

function countTriangles(gltf: GltfJson): number {
  let triangles = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.indices === undefined) continue;
      const accessor = gltf.accessors?.[primitive.indices];
      triangles += (accessor?.count ?? 0) / 3;
    }
  }
  return triangles;
}

function meshBounds(gltf: GltfJson): { min: number[]; max: number[] } | undefined {
  let min: number[] | undefined;
  let max: number[] | undefined;
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const index = primitive.attributes?.POSITION;
      if (index === undefined) continue;
      const accessor = gltf.accessors?.[index];
      if (!accessor?.min || !accessor.max) continue;
      min = min
        ? min.map((value, i) => Math.min(value, accessor.min?.[i] ?? value))
        : [...accessor.min];
      max = max
        ? max.map((value, i) => Math.max(value, accessor.max?.[i] ?? value))
        : [...accessor.max];
    }
  }
  if (!min || !max) return undefined;
  return { min, max };
}
