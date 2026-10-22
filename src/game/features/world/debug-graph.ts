/** F4 draws the road graph and the sidewalk navmesh with thin boxes. */

import { buildCostaVerde } from '../../../content/city';
import { writeTransformMatrix } from '../../../engine/core/math';
import type { GameContext } from '../../context';

let graphMesh = 0;
let navMesh = 0;
let built = false;

/** Mesh ids belong to the last renderer. The next session builds the view again. */
export function resetDebugView(): void {
  graphMesh = 0;
  navMesh = 0;
  built = false;
}

export function syncDebugView(ctx: GameContext): void {
  if (!built) {
    if (!ctx.debug.showGraph) return;
    build(ctx);
  }
  ctx.renderer.setMeshVisible(graphMesh, ctx.debug.showGraph);
  ctx.renderer.setMeshVisible(navMesh, ctx.debug.showGraph);
}

function build(ctx: GameContext): void {
  const city = buildCostaVerde();
  const roads = city.graph.edges.length;
  const roadMatrices = new Float32Array(Math.max(1, roads) * 16);
  const roadColors = new Float32Array(Math.max(1, roads) * 3);
  city.graph.edges.forEach((edge, index) => {
    const a = city.graph.nodes[edge.a];
    const b = city.graph.nodes[edge.b];
    if (!a || !b) return;
    const y = 4.4;
    writeTransformMatrix(
      roadMatrices,
      index,
      (a.x + b.x) / 2,
      y,
      (a.z + b.z) / 2,
      Math.atan2(b.x - a.x, b.z - a.z),
      0,
      0.35,
      0.08,
      edge.length,
    );
    roadColors[index * 3] = edge.kind === 'coast' ? 1 : 0.9;
    roadColors[index * 3 + 1] = edge.kind === 'street' ? 0.85 : 0.55;
    roadColors[index * 3 + 2] = 0.2;
  });
  graphMesh = ctx.renderer.addInstances({
    unit: true,
    kind: 'box',
    size: { x: 1, y: 1, z: 1 },
    color: 0xffffff,
    count: Math.max(1, roads),
    matrices: roadMatrices,
    colors: roadColors,
    castShadow: false,
  });
  const quads = city.walks.length;
  const navMatrices = new Float32Array(Math.max(1, quads) * 16);
  const navColors = new Float32Array(Math.max(1, quads) * 3);
  city.walks.forEach((quad, index) => {
    const x = (quad.ax + quad.cx) / 2;
    const z = (quad.az + quad.cz) / 2;
    writeTransformMatrix(navMatrices, index, x, quad.y + 0.15, z, 0, 0, 1.2, 0.05, 1.2);
    const tint = quad.crosswalk ? 0.95 : 0.25;
    navColors[index * 3] = tint;
    navColors[index * 3 + 1] = quad.crosswalk ? 0.95 : 0.55;
    navColors[index * 3 + 2] = quad.crosswalk ? 0.3 : 0.95;
  });
  navMesh = ctx.renderer.addInstances({
    unit: true,
    kind: 'box',
    size: { x: 1, y: 1, z: 1 },
    color: 0xffffff,
    count: Math.max(1, quads),
    matrices: navMatrices,
    colors: navColors,
    castShadow: false,
  });
  built = true;
}
