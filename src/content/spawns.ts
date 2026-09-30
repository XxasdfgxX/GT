/** One standing point per neighborhood, on a sidewalk beside a road node. */

import { sampleHeight, urbanZones, zoneAt, onIsland } from './map/island-shape';
import { SIDEWALK_WIDTH, type RoadGraph, type RoadNode } from './map/roads';
import { sim } from './sim';
import { sedan } from './vehicles';

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

/** The opening camera looks north, so the parked car sits south of the player. */
export function parkedBehind(player: { x: number; z: number }): {
  x: number;
  y: number;
  z: number;
  yaw: number;
} {
  const home = soloSpawn();
  const x = player.x + sedan.spawn.x - home.x;
  const z = player.z + sedan.spawn.z - home.z;
  return { x, z, y: sampleHeight(x, z) + sedan.spawn.y, yaw: sedan.spawnYaw };
}

/** Side length of the square around a spawn point. Each entry rolls inside it. */
export const SPAWN_SPREAD = 10;

/** A fresh point inside the 10×10 square, so two entries rarely share a tile. */
export function scatterSpawn(spawn: BairroSpawn, rng: () => number): BairroSpawn {
  const x = spawn.x + (rng() - 0.5) * SPAWN_SPREAD;
  const z = spawn.z + (rng() - 0.5) * SPAWN_SPREAD;
  return { name: spawn.name, x, z, y: stand(x, z) };
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

export function findSpawn(spawns: readonly BairroSpawn[], name: string): BairroSpawn | null {
  if (name.length === 0) return null;
  return spawns.find((spawn) => spawn.name === name) ?? null;
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
