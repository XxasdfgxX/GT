/** One standing point per neighborhood, on a sidewalk beside a road node. */

import { sampleHeight, urbanZones, zoneAt, onIsland } from './map/island-shape';
import type { BoxCollider } from './map/batch';
import { rectsOverlap } from './map/blocks';
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

export interface ParkedSpot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Meters kept between a parked car's end and a junction node. */
const JUNCTION_CLEAR = 10;
/** Gap between the car's outer side and the edge of the asphalt. */
const CURB_GAP = 0.35;
/** Room around the player capsule and around the car, so nothing starts overlapped. */
const PLAYER_ROOM = 0.9;
const CAR_ROOM = 0.25;
/** Tried in order: beside the player, then sliding up and down the curb. */
const SLIDES = [0, -3, 3, -6, 6, -9, 9, -12, 12, -16, 16, -20, 20, -25, 25];

/**
 * Curb side of the street nearest the player, facing the traffic on that side.
 * Slides along the curb until it clears buildings, parked props and the player.
 */
export function parkOnStreet(
  city: {
    graph: RoadGraph;
    colliders: readonly BoxCollider[];
    streetProps?: readonly BoxCollider[];
  },
  player: { x: number; z: number },
  half: { x: number; z: number },
): ParkedSpot {
  const { graph } = city;
  const margin = JUNCTION_CLEAR + half.z;
  const streets = graph.edges
    .map((edge) => ({ edge, distance: distanceToEdge(graph, edge, player, margin) }))
    .filter((item) => Number.isFinite(item.distance))
    .sort((a, b) => a.distance - b.distance);
  let fallback: ParkedSpot | null = null;
  for (const { edge } of streets.slice(0, 4)) {
    const a = graph.nodes[edge.a];
    const b = graph.nodes[edge.b];
    if (!a || !b) continue;
    const fx = (b.x - a.x) / edge.length;
    const fz = (b.z - a.z) / edge.length;
    // (fz, -fx) is the right of a→b, where dir-0 traffic drives.
    const right = (player.x - a.x) * fz - (player.z - a.z) * fx >= 0;
    const lateral = (right ? 1 : -1) * (edge.width / 2 - CURB_GAP - half.x);
    const yaw = right ? Math.atan2(fx, fz) : Math.atan2(-fx, -fz);
    const beside = (player.x - a.x) * fx + (player.z - a.z) * fz;
    for (const slide of SLIDES) {
      const along = Math.min(edge.length - margin, Math.max(margin, beside + slide));
      const x = a.x + fx * along + fz * lateral;
      const z = a.z + fz * along - fx * lateral;
      const spot = { x, y: sampleHeight(x, z) + sedan.spawn.y, z, yaw };
      fallback ??= spot;
      const body = { x, z, hx: half.x + CAR_ROOM, hz: half.z + CAR_ROOM, yaw };
      const feet = { x: player.x, z: player.z, hx: PLAYER_ROOM, hz: PLAYER_ROOM, yaw: 0 };
      if (rectsOverlap(body, feet)) continue;
      const blocked = (box: { hy: number } & Parameters<typeof rectsOverlap>[1]) =>
        box.hy >= 0.4 && rectsOverlap(body, box);
      if (city.colliders.some(blocked) || (city.streetProps ?? []).some(blocked)) continue;
      return spot;
    }
  }
  if (!fallback) throw new Error('nenhuma rua para estacionar');
  return fallback;
}

/** Distance to the part of the street at least `margin` from both ends. */
function distanceToEdge(
  graph: RoadGraph,
  edge: RoadGraph['edges'][number],
  point: { x: number; z: number },
  margin: number,
): number {
  const a = graph.nodes[edge.a];
  const b = graph.nodes[edge.b];
  if (!a || !b || edge.length <= margin * 2) return Infinity;
  const fx = (b.x - a.x) / edge.length;
  const fz = (b.z - a.z) / edge.length;
  const along = (point.x - a.x) * fx + (point.z - a.z) * fz;
  const clamped = Math.min(edge.length - margin, Math.max(margin, along));
  return Math.hypot(a.x + fx * clamped - point.x, a.z + fz * clamped - point.z);
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

/** Meters up the street from the node, clear of the junction box. */
const OFF_JUNCTION = 12;

/** Middle of the sidewalk a short walk up the first street out of the node. */
function besideSidewalk(graph: RoadGraph, node: RoadNode): { x: number; z: number } | null {
  const edge = graph.edges.find((item) => item.a === node.id || item.b === node.id);
  if (!edge) return null;
  const other = graph.nodes.find((item) => item.id === (edge.a === node.id ? edge.b : edge.a));
  if (!other) return null;
  const length = Math.hypot(other.x - node.x, other.z - node.z) || 1;
  const fx = (other.x - node.x) / length;
  const fz = (other.z - node.z) / length;
  const along = Math.min(OFF_JUNCTION, length / 2);
  // Same line the sidewalk mesh is laid on (road-mesh.ts).
  const side = edge.width / 2 + 0.32 + SIDEWALK_WIDTH / 2;
  return {
    x: node.x + fx * along - fz * side,
    z: node.z + fz * along + fx * side,
  };
}
