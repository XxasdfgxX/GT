/** Sidewalk navmesh. three-pathfinding stays in this adapter so the game never imports it. */

import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { Pathfinding } from 'three-pathfinding';
import type { NavMesh, NavQuad } from './nav-mesh';

const ZONE = 'sidewalk';

export function createPathNav(): NavMesh {
  const pathfinding = new Pathfinding();
  const start = new Vector3();
  const end = new Vector3();
  let ready = false;

  return {
    load(quads) {
      const geometry = new BufferGeometry();
      const positions = new Float32Array(quads.length * 6 * 3);
      const indices = new Uint32Array(quads.length * 6);
      quads.forEach((quad, index) => writeQuad(positions, indices, quad, index));
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      geometry.setIndex(new BufferAttribute(indices, 1));
      pathfinding.setZoneData(ZONE, Pathfinding.createZone(geometry));
      geometry.dispose();
      ready = quads.length > 0;
    },
    find(x0, y0, z0, x1, y1, z1, outX, outZ, offset, cap) {
      if (!ready || cap <= 0) return 0;
      start.set(x0, y0, z0);
      end.set(x1, y1, z1);
      const group = pathfinding.getGroup(ZONE, start);
      if (group == null || group < 0) return 0;
      const path = pathfinding.findPath(start, end, ZONE, group);
      if (!path || path.length === 0) return 0;
      const count = Math.min(cap, path.length);
      for (let i = 0; i < count; i += 1) {
        const point = path[i];
        if (!point) continue;
        outX[offset + i] = point.x;
        outZ[offset + i] = point.z;
      }
      return count;
    },
  };
}

function writeQuad(
  positions: Float32Array,
  indices: Uint32Array,
  quad: NavQuad,
  index: number,
): void {
  const base = index * 18;
  const y = quad.y;
  const corners = [
    quad.ax,
    y,
    quad.az,
    quad.bx,
    y,
    quad.bz,
    quad.cx,
    y,
    quad.cz,
    quad.dx,
    y,
    quad.dz,
  ];
  // Two triangles: 0-1-2 and 0-2-3, but vertices are duplicated per triangle (6 verts).
  const tri = [0, 1, 2, 0, 2, 3];
  for (let i = 0; i < 6; i += 1) {
    const corner = tri[i] ?? 0;
    positions[base + i * 3] = corners[corner * 3] ?? 0;
    positions[base + i * 3 + 1] = corners[corner * 3 + 1] ?? y;
    positions[base + i * 3 + 2] = corners[corner * 3 + 2] ?? 0;
    indices[index * 6 + i] = index * 6 + i;
  }
}
