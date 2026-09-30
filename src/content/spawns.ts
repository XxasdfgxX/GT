/** One standing point per neighborhood, on a sidewalk beside a road node. */

import { sampleHeight, urbanZones, zoneAt, onIsland } from './map/island-shape';
import { SIDEWALK_WIDTH, type RoadGraph, type RoadNode } from './map/roads';
import { sim } from './sim';

export interface BairroSpawn {
  name: string;
  x: number;
  y: number;
  z: number;
}

export function soloSpawn(): BairroSpawn {
  const x = 0;
  const z = 12;
  return { name: 'solo', x, z, y: stand(x, z) };
}

export function bairroSpawns(graph: RoadGraph): BairroSpawn[] {
  return urbanZones.map((zone) => {
    let best: RoadNode | undefined;
    let bestDistance = Infinity;
    for (const node of graph.nodes) {
      if (zoneAt(node.x, node.z)?.name !== zone.name) continue;
      const distance = Math.hypot(node.x - zone.x, node.z - zone.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = node;
      }
    }
    let x = best?.x ?? zone.x;
    let z = best?.z ?? zone.z;
    if (best) {
      const shifted = besideSidewalk(graph, best);
      if (
        shifted &&
        onIsland(shifted.x, shifted.z) &&
        zoneAt(shifted.x, shifted.z)?.name === zone.name
      ) {
        x = shifted.x;
        z = shifted.z;
      }
    }
    return { name: zone.name, x, y: stand(x, z), z };
  });
}

export function pickSpawn(spawns: readonly BairroSpawn[], rng: () => number): BairroSpawn {
  const index = Math.min(spawns.length - 1, Math.max(0, Math.floor(rng() * spawns.length)));
  const spawn = spawns[index];
  if (!spawn) throw new Error('sem spawn');
  return spawn;
}

function stand(x: number, z: number): number {
  return sampleHeight(x, z) + sim.playerRadius + sim.playerHalfHeight;
}

function besideSidewalk(graph: RoadGraph, node: RoadNode): { x: number; z: number } | null {
  const edge = graph.edges.find((item) => item.a === node.id || item.b === node.id);
  if (!edge) return null;
  const a = graph.nodes.find((item) => item.id === edge.a);
  const b = graph.nodes.find((item) => item.id === edge.b);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  const shift = Math.min(SIDEWALK_WIDTH, edge.width / 2);
  return { x: node.x + (-dz / length) * shift, z: node.z + (dx / length) * shift };
}
