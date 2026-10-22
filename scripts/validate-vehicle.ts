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
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
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
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: GltfMesh[];
  accessors?: GltfAccessor[];
}

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

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
    (bounds.max[0] ?? 0) - (bounds.min[0] ?? 0),
    (bounds.max[2] ?? 0) - (bounds.min[2] ?? 0),
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
      // Without indices every three POSITION vertices are a triangle.
      const index = primitive.indices ?? primitive.attributes?.POSITION;
      if (index === undefined) continue;
      triangles += (gltf.accessors?.[index]?.count ?? 0) / 3;
    }
  }
  return triangles;
}

/** World-space box of every mesh, through the node scales and rotations exporters use. */
function meshBounds(gltf: GltfJson): { min: number[]; max: number[] } | undefined {
  const nodes = gltf.nodes ?? [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const visit = (index: number, parent: number[]): void => {
    const node = nodes[index];
    if (!node) return;
    const world = multiply(parent, localMatrix(node));
    const mesh = node.mesh === undefined ? undefined : gltf.meshes?.[node.mesh];
    for (const primitive of mesh?.primitives ?? []) {
      const position = primitive.attributes?.POSITION;
      const accessor = position === undefined ? undefined : gltf.accessors?.[position];
      if (!accessor?.min || !accessor.max) continue;
      for (let corner = 0; corner < 8; corner += 1) {
        const local = [0, 1, 2].map((axis) =>
          (corner >> axis) & 1 ? (accessor.max?.[axis] ?? 0) : (accessor.min?.[axis] ?? 0),
        );
        const point = transform(world, local);
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis] ?? Infinity, point[axis] ?? 0);
          max[axis] = Math.max(max[axis] ?? -Infinity, point[axis] ?? 0);
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of sceneRoots(gltf)) visit(root, identity);
  if (!Number.isFinite(min[0])) return undefined;
  return { min, max };
}

function sceneRoots(gltf: GltfJson): number[] {
  const listed = gltf.scenes?.[gltf.scene ?? 0]?.nodes;
  if (listed) return listed;
  const children = new Set((gltf.nodes ?? []).flatMap((node) => node.children ?? []));
  return (gltf.nodes ?? []).map((_, index) => index).filter((index) => !children.has(index));
}

/** Column-major, as glTF stores it. */
function localMatrix(node: GltfNode): number[] {
  if (node.matrix) return node.matrix;
  const [x = 0, y = 0, z = 0, w = 1] = node.rotation ?? [];
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
  const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

function multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function transform(m: number[], p: number[]): number[] {
  const [x = 0, y = 0, z = 0] = p;
  return [0, 1, 2].map(
    (row) => (m[row] ?? 0) * x + (m[4 + row] ?? 0) * y + (m[8 + row] ?? 0) * z + (m[12 + row] ?? 0),
  );
}
