// Thins a tree's leaves before simplifying: keeps one leaflet in `every` and scales each kept
// one up around its own center, so the crown stays nearly as full with far less geometry.
// The simplifier alone collapses leaflets to nothing; this keeps whole ones.
// Run: node --max-old-space-size=4096 scripts/thin-leaves.mjs <in.gltf> <out.glb> <every> <scale>

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const [input, output, everyArg, scaleArg] = process.argv.slice(2);
if (!input || !output) throw new Error('usage: thin-leaves.mjs <in> <out> <every> <scale>');
const every = Number(everyArg ?? 20);
const scale = Number(scaleArg ?? 3.2);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);

for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    if (!primitive.getMaterial()?.getName().includes('leaves')) continue;
    const indices = primitive.getIndices()?.getArray();
    const position = primitive.getAttribute('POSITION');
    if (!indices || !position) continue;
    const count = position.getCount();

    // Leaflets are the connected pieces of the index buffer.
    const parent = new Int32Array(count).map((_, i) => i);
    const find = (a) => {
      let root = a;
      while (parent[root] !== root) root = parent[root];
      while (parent[a] !== root) {
        const next = parent[a];
        parent[a] = root;
        a = next;
      }
      return root;
    };
    for (let i = 0; i < indices.length; i += 3) {
      const a = find(indices[i]);
      parent[find(indices[i + 1])] = a;
      parent[find(indices[i + 2])] = a;
    }

    // Number the leaflets in the order they appear, and keep every `every`th.
    const ordinal = new Map();
    const kept = new Uint8Array(count);
    for (let v = 0; v < count; v += 1) {
      const root = find(v);
      if (!ordinal.has(root)) ordinal.set(root, ordinal.size);
      if (ordinal.get(root) % every === 0) kept[v] = 1;
    }

    // Each kept leaflet grows around its own center.
    const points = position.getArray();
    const centers = new Map();
    for (let v = 0; v < count; v += 1) {
      if (!kept[v]) continue;
      const root = find(v);
      const sum = centers.get(root) ?? [0, 0, 0, 0];
      sum[0] += points[v * 3];
      sum[1] += points[v * 3 + 1];
      sum[2] += points[v * 3 + 2];
      sum[3] += 1;
      centers.set(root, sum);
    }

    const remap = new Int32Array(count).fill(-1);
    let next = 0;
    for (let v = 0; v < count; v += 1) if (kept[v]) remap[v] = next++;
    for (const semantic of primitive.listSemantics()) {
      const attribute = primitive.getAttribute(semantic);
      const size = attribute.getElementSize();
      const source = attribute.getArray();
      const target = new source.constructor(next * size);
      for (let v = 0; v < count; v += 1) {
        if (remap[v] < 0) continue;
        for (let k = 0; k < size; k += 1) target[remap[v] * size + k] = source[v * size + k];
        if (semantic !== 'POSITION') continue;
        const [sx, sy, sz, n] = centers.get(find(v));
        const center = [sx / n, sy / n, sz / n];
        for (let k = 0; k < 3; k += 1) {
          const at = remap[v] * 3 + k;
          target[at] = center[k] + (target[at] - center[k]) * scale;
        }
      }
      attribute.setArray(target);
    }
    const triangles = [];
    for (let i = 0; i < indices.length; i += 3) {
      if (remap[indices[i]] < 0) continue;
      triangles.push(remap[indices[i]], remap[indices[i + 1]], remap[indices[i + 2]]);
    }
    primitive.getIndices().setArray(new Uint32Array(triangles));
    console.log(
      `${mesh.getName()}: ${ordinal.size} leaflets -> ${Math.ceil(ordinal.size / every)}, ` +
        `${indices.length / 3} -> ${triangles.length / 3} triangles`,
    );
  }
}

await io.write(output, document);
