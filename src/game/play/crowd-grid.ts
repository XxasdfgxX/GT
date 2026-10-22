/**
 * Walkers bucketed on a 4 m grid once per tick. A walker moves well under a cell
 * per tick, so a query with the caller's live reach still finds everyone the full
 * scan would. Callers re-check positions and flags themselves.
 */

import type { World } from 'bitecs';
import { CAP, Pedestrian, Transform } from '../ecs/components';
import { pedestrians } from '../ecs/queries';

const CELL = 4;
/** Slack for walkers moved since the buckets were filled: a step, or a punch knock-back. */
const DRIFT = 1;
const SLOTS = 1024;

const heads = new Int32Array(SLOTS);
const next = new Int32Array(CAP);
const cellX = new Int32Array(CAP);
const cellZ = new Int32Array(CAP);
const found: number[] = [];
let builtWorld: World | null = null;
let builtTick = -1;

/** Fills the buckets unless this world already did for this tick. */
export function bucketCrowd(world: World, tick: number): void {
  if (builtWorld === world && builtTick === tick) return;
  builtWorld = world;
  builtTick = tick;
  heads.fill(-1);
  for (const eid of pedestrians(world)) {
    if ((Pedestrian.active[eid] ?? 0) === 0 || (Pedestrian.driving[eid] ?? 0) === 1) continue;
    const cx = Math.floor((Transform.px[eid] ?? 0) / CELL);
    const cz = Math.floor((Transform.pz[eid] ?? 0) / CELL);
    const slot = slotOf(cx, cz);
    cellX[eid] = cx;
    cellZ[eid] = cz;
    next[eid] = heads[slot] ?? -1;
    heads[slot] = eid;
  }
}

/** Walkers bucketed near (x, z). The array is reused: read it before the next call. */
export function crowdNear(x: number, z: number, reach: number): readonly number[] {
  found.length = 0;
  const span = reach + DRIFT;
  const x0 = Math.floor((x - span) / CELL);
  const x1 = Math.floor((x + span) / CELL);
  const z0 = Math.floor((z - span) / CELL);
  const z1 = Math.floor((z + span) / CELL);
  for (let cz = z0; cz <= z1; cz += 1) {
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let eid = heads[slotOf(cx, cz)] ?? -1; eid >= 0; eid = next[eid] ?? -1) {
        if (cellX[eid] === cx && cellZ[eid] === cz) found.push(eid);
      }
    }
  }
  return found;
}

function slotOf(cx: number, cz: number): number {
  return (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & (SLOTS - 1);
}
