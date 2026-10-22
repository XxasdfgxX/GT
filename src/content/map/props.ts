/** Street furniture along the sidewalk. Parked cars stay on the curb, off the lane. */

import { chunkIndex, type BoxCollider, type CityBatcher, type MeshLod, type Stamp } from './batch';
import { fitPlazas, plazaGrassArea, type Footprint } from './blocks';
import type { ShopDoor } from './facades';
import { onIsland, sampleHeight, urbanWeight } from './island-shape';
import { mulberry32 } from './rng';
import { STREET_LIFT } from './road-mesh';
import { SIDEWALK_WIDTH, type RoadGraph } from './roads';
import { carModel } from '../models';

export interface Poi {
  x: number;
  z: number;
  kind: 'shop' | 'stop' | 'plaza' | 'stall';
}

export interface PropResult {
  pois: Poi[];
  colliders: BoxCollider[];
  /** Street furniture the player and cars bump into. Walkers pass: they steer by the sidewalk. */
  solids: BoxCollider[];
  trees: number;
  grass: number;
}

/** Street props from scripts/import-polyhaven-models.mjs. All are Poly Haven, CC0. */
export const PROPS = {
  lamp: '/assets/props/street-lamp.glb',
  trashCan: '/assets/props/trash-can.glb',
  bench: '/assets/props/bench.glb',
  hydrant: '/assets/props/hydrant.glb',
  utilityBox: '/assets/props/utility-box.glb',
  barrier: '/assets/props/barrier.glb',
  pottedPlant: '/assets/props/potted-plant.glb',
  shrub: '/assets/props/shrub.glb',
  planter: '/assets/props/planter.glb',
  crate: '/assets/props/crate.glb',
  fern: '/assets/props/fern.glb',
  tree: '/assets/props/tree.glb',
} as const;

/** Parked cars: the same body as the traffic, painted per instance. */
const PARKED_CAR = carModel;

/** Every prop url, for the loader to fetch before the first chunk streams in. */
export const PROP_MODELS: readonly string[] = [...Object.values(PROPS), PARKED_CAR];

/** Models whose body paint takes each stamp's color. Metal on the others keeps its own. */
export const PAINTED_MODELS: ReadonlySet<string | undefined> = new Set([PARKED_CAR]);

const carColors = [0xc4553a, 0xf4f1ea, 0x2a2a2a, 0xd5dde4, 0xf2c14e, 0x1f4e79];

export function buildProps(
  graph: RoadGraph,
  doors: ShopDoor[],
  footprints: Footprint[],
  batch: CityBatcher,
): PropResult {
  const rng = mulberry32(0x5a1e);
  // New props draw from their own stream, so the parked cars and trees keep their places.
  const garden = mulberry32(0x9a2d);
  const dressing = mulberry32(0x7c41);
  const pois: Poi[] = [];
  const colliders: BoxCollider[] = [];
  const solids: BoxCollider[] = [];
  let trees = 0;
  for (const door of doors) {
    if (door.x * door.x + (door.z - 8) * (door.z - 8) < 16 * 16) continue;
    pois.push({ x: door.x, z: door.z, kind: 'shop' });
    // Potted plants either side of some shop doors, against the wall; a bin by others.
    const roll = dressing();
    const fx = Math.sin(door.yaw);
    const fz = Math.cos(door.yaw);
    const rx = Math.cos(door.yaw);
    const rz = -Math.sin(door.yaw);
    const chunk = chunkIndex(door.x, door.z);
    if (roll < 0.45) {
      for (const side of [-1, 1]) {
        const px = door.x - fx * 0.9 + rx * side * 1.5;
        const pz = door.z - fz * 0.9 + rz * side * 1.5;
        const y = sampleHeight(px, pz);
        batch.add(prop(PROPS.pottedPlant, px, y, pz, dressing() * Math.PI * 2, 3.5, chunk));
        solid(solids, px, y, pz, 0, 0.3, 0.47, 0.3);
      }
    } else if (roll < 0.7) {
      const px = door.x - fx * 0.9 + rx * 2.2;
      const pz = door.z - fz * 0.9 + rz * 2.2;
      const y = sampleHeight(px, pz);
      addBin(batch, px, y, pz, door.yaw + Math.PI / 2, chunk);
      solid(solids, px, y, pz, door.yaw + Math.PI / 2, 0.71, 0.36, 0.22);
    }
  }
  // Shrubs along the front of most houses, either side of the door.
  for (const lot of footprints) {
    if (lot.kind !== 'house' || dressing() < 0.35) continue;
    const fx = Math.sin(lot.yaw);
    const fz = Math.cos(lot.yaw);
    const rx = Math.cos(lot.yaw);
    const rz = -Math.sin(lot.yaw);
    const out = lot.sz / 2 + 0.5;
    for (const along of [-1, -0.45, 0.45, 1]) {
      const reach = along * (lot.sx / 2 - 0.9);
      if (Math.abs(reach) < 1.2) continue;
      const px = lot.x + fx * out + rx * reach;
      const pz = lot.z + fz * out + rz * reach;
      batch.add(
        centered(
          PROPS.shrub,
          px,
          sampleHeight(px, pz),
          pz,
          dressing() * Math.PI * 2,
          2.4,
          lot.chunk,
        ),
      );
    }
  }
  for (const plaza of fitPlazas(graph)) {
    const y = sampleHeight(plaza.x, plaza.z);
    const chunk = chunkIndex(plaza.x, plaza.z);
    batch.add(
      flat('plaza', plaza.sx, 0.05, plaza.sz, plaza.x, y + 0.04, plaza.z, 0, 0xffffff, chunk),
    );
    batch.add(
      flat(
        'grass',
        plaza.sx * 0.62,
        0.06,
        plaza.sz * 0.62,
        plaza.x,
        y + 0.08,
        plaza.z,
        0,
        0xffffff,
        chunk,
      ),
    );
    // Planters at the corners of the lawn, shrubs and ferns along its edge.
    const hx = plaza.sx * 0.31;
    const hz = plaza.sz * 0.31;
    for (const [cx, cz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const px = plaza.x + cx * (hx + 1.2);
      const pz = plaza.z + cz * (hz + 1.2);
      batch.add(prop(PROPS.planter, px, y + 0.06, pz, 0, 1.6, chunk));
      solid(solids, px, y, pz, 0, 0.74, 0.34, 0.34);
      // The planter ships empty: a shrub fills it, set into the soil line.
      batch.add(
        centered(PROPS.shrub, px, y + 0.06 + 0.32 * 1.6, pz, garden() * Math.PI * 2, 2.6, chunk),
      );
    }
    for (let k = 0; k < 10; k += 1) {
      const along = (k + 0.5) / 10;
      const north = k % 2 === 0;
      const px = plaza.x - hx + along * hx * 2;
      const pz = plaza.z + (north ? hz - 0.6 : -hz + 0.6);
      const look = garden() > 0.5 ? PROPS.shrub : PROPS.fern;
      batch.add(
        centered(
          look,
          px,
          y + 0.1,
          pz,
          garden() * Math.PI * 2,
          look === PROPS.shrub ? 4 : 1.6,
          chunk,
        ),
      );
    }
    pois.push({ x: plaza.x, z: plaza.z, kind: 'plaza' });
  }
  for (const edge of graph.edges) {
    const a = graph.nodes[edge.a];
    const b = graph.nodes[edge.b];
    if (!a || !b) continue;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const inset = 10;
    // Manhole covers in alternate lanes every 40 m, clear of the junctions.
    for (let distance = 20; distance < edge.length - 14; distance += 40) {
      const lane = (Math.round(distance / 40) % 2 === 0 ? 1 : -1) * edge.width * 0.25;
      const x = a.x + fx * distance + rx * lane;
      const z = a.z + fz * distance + rz * lane;
      if (!onIsland(x, z) || urbanWeight(x, z) < 0.96) continue;
      const y = sampleHeight(x, z);
      if (y < 1) continue;
      batch.add({
        kind: 'cylinder',
        finish: 'flat',
        sx: 0.75,
        sy: 0.04,
        sz: 0.75,
        x,
        y: y + STREET_LIFT + 0.01,
        z,
        yaw,
        pitch: 0,
        color: 0x3b3a38,
        roughness: 0.55,
        metalness: 0.7,
        emissive: 0,
        castShadow: false,
        chunk: chunkIndex(x, z),
        lod: 'near',
      });
    }
    // Slots every 12 m on both sides. Lamps stand 24 m apart on one side; trees fill the rest.
    for (let distance = inset; distance < edge.length - inset; distance += 12) {
      const evenSlot = Math.round((distance - inset) / 12) % 2 === 0;
      for (const side of [-1, 1] as const) {
        const lampSlot = side === -1 && evenSlot;
        const walk = edge.width / 2 + 0.32 + SIDEWALK_WIDTH * 0.55;
        const x = a.x + fx * distance + rx * side * walk;
        const z = a.z + fz * distance + rz * side * walk;
        if (!onIsland(x, z) || urbanWeight(x, z) < 0.96) continue;
        const y = sampleHeight(x, z);
        if (y < 1) continue;
        const chunk = chunkIndex(x, z);
        if (lampSlot) {
          addLamp(batch, x, y, z, yaw, chunk);
          solid(solids, x, y, z, yaw, 0.15, 2.3, 0.15);
        } else {
          addTree(batch, x, y, z, chunk, rng, edge.kind === 'coast');
          trees += 1;
        }
        if (edge.kind !== 'coast' && rng() > 0.62 && !lampSlot) {
          const curb = edge.width / 2 + 0.7;
          const cx = a.x + fx * distance + rx * side * curb;
          const cz = a.z + fz * distance + rz * side * curb;
          if (Math.abs(cx) < 8 && cz > -6 && cz < 22) continue;
          addParked(batch, colliders, cx, sampleHeight(cx, cz), cz, yaw, chunk, rng);
        }
        if (edge.kind !== 'street' && rng() > 0.82) {
          addBench(batch, x, y, z, yaw, chunk);
          solid(solids, x, y, z, yaw + Math.PI / 2, 1.3, 0.47, 0.38);
        }
        if (rng() > 0.9) {
          addBin(batch, x + rx * 0.4, y, z + rz * 0.4, yaw, chunk);
          solid(solids, x + rx * 0.4, y, z + rz * 0.4, yaw, 0.71, 0.36, 0.22);
        }
        // A hydrant every 84 m on the side without lamps.
        if (side === 1 && Math.round((distance - inset) / 12) % 7 === 3) {
          batch.add(prop(PROPS.hydrant, x - fx * 1.6, y, z - fz * 1.6, yaw, 1, chunk));
          solid(solids, x - fx * 1.6, y, z - fz * 1.6, yaw, 0.2, 0.4, 0.16);
        }
      }
    }
    if (edge.kind !== 'street' && edge.length > 40) {
      const mid = edge.length * 0.5;
      const x = a.x + fx * mid + rx * (edge.width / 2 + 2.2);
      const z = a.z + fz * mid + rz * (edge.width / 2 + 2.2);
      if (onIsland(x, z)) {
        const y = sampleHeight(x, z);
        const chunk = chunkIndex(x, z);
        addShelter(batch, x, y, z, yaw, chunk);
        // The back panel and the two sides; the open front faces the curb.
        solid(solids, x + rx * 0.65, y, z + rz * 0.65, yaw, 0.03, 1.05, 1.7);
        for (const along of [-1.6, 1.6])
          solid(solids, x + fx * along, y, z + fz * along, yaw, 0.7, 1.2, 0.04);
        pois.push({ x, z, kind: 'stop' });
      }
    }
  }
  let stalls = 0;
  for (const lot of footprints) {
    if (lot.kind !== 'shop' || stalls >= 8 || lot.seed % 7 !== 0) continue;
    const fx = Math.sin(lot.yaw);
    const fz = Math.cos(lot.yaw);
    const x = lot.x + fx * (lot.sz / 2 + 2.2);
    const z = lot.z + fz * (lot.sz / 2 + 2.2);
    if (Math.abs(x) < 8 && z > -4 && z < 20) continue;
    const y = sampleHeight(x, z);
    addStall(batch, x, y, z, lot.yaw, lot.chunk, lot.seed);
    solid(solids, x, y, z, lot.yaw, 0.95, 0.47, 0.5);
    // Beverage crates stacked beside the stall.
    const rx = Math.cos(lot.yaw);
    const rz = -Math.sin(lot.yaw);
    for (let k = 0; k < 3; k += 1) {
      batch.add(
        prop(
          PROPS.crate,
          x + rx * 1.4,
          y + k * 0.35,
          z + rz * 1.4,
          lot.yaw + garden() * 0.4,
          1.3,
          lot.chunk,
        ),
      );
    }
    pois.push({ x, z, kind: 'stall' });
    stalls += 1;
  }
  for (const node of graph.nodes) {
    let degree = 0;
    let avenue = false;
    for (const edge of graph.edges) {
      if (edge.a !== node.id && edge.b !== node.id) continue;
      degree += 1;
      if (edge.kind !== 'street') avenue = true;
    }
    if (degree < 3 || !avenue) continue;
    const y = sampleHeight(node.x, node.z);
    if (y < 1) continue;
    const chunk = chunkIndex(node.x, node.z);
    batch.add(flat('flat', 0.16, 4.2, 0.16, node.x + 3, y + 2.1, node.z + 3, 0, 0x222222, chunk));
    // The traffic-light controller cabinet on the corner.
    batch.add(prop(PROPS.utilityBox, node.x + 3.8, y, node.z + 3, Math.PI / 4, 1, chunk));
    solid(solids, node.x + 3.8, y, node.z + 3, Math.PI / 4, 0.46, 0.56, 0.22);
    batch.add({
      kind: 'box',
      finish: 'flat',
      sx: 0.35,
      sy: 0.7,
      sz: 0.2,
      x: node.x + 3,
      y: y + 4.3,
      z: node.z + 3,
      yaw: 0,
      pitch: 0,
      color: 0x3a7d32,
      roughness: 0.4,
      metalness: 0.1,
      emissive: 0x3a7d32,
      castShadow: false,
      chunk,
      lod: 'always',
    });
  }
  return { pois, colliders, solids, trees, grass: plazaGrassArea(graph) };
}

function addTree(
  batch: CityBatcher,
  x: number,
  y: number,
  z: number,
  chunk: number,
  rng: () => number,
  coastal: boolean,
): void {
  // Two draws, as before, so the parked cars and benches after it keep their places.
  const size = rng();
  const kind = rng();
  if (coastal || kind > 0.6) {
    addPalm(batch, x, y, z, chunk, size, kind);
    return;
  }
  // The Poly Haven island tree is 3.4 m; streets want 4.5 to 6.
  batch.add(prop(PROPS.tree, x, y, z, kind * Math.PI * 20, 1.3 + size * 0.45, chunk, 'always'));
}

/** Where a plant's middle sits from its origin, in its own meters: these models are not centered. */
const PLANT_CENTERS: Record<string, { x: number; z: number }> = {
  [PROPS.fern]: { x: 0.455, z: 0.44 },
  [PROPS.shrub]: { x: 0.27, z: 0 },
};

/** A plant whose middle, not its origin, lands on (x, z) whatever its yaw and scale. */
function centered(
  model: string,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale: number,
  chunk: number,
  lod: MeshLod = 'near',
): Stamp {
  const middle = PLANT_CENTERS[model] ?? { x: 0, z: 0 };
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  // Local x runs along (cos, -sin) and local z along (sin, cos).
  const ox = (middle.x * cos + middle.z * sin) * scale;
  const oz = (-middle.x * sin + middle.z * cos) * scale;
  return prop(model, x - ox, y, z - oz, yaw, scale, chunk, lod);
}

/** A coconut palm: a leaning, tapering trunk under a fern crown blown up to frond size. */
function addPalm(
  batch: CityBatcher,
  x: number,
  y: number,
  z: number,
  chunk: number,
  size: number,
  kind: number,
): void {
  const height = 6 + size * 3;
  const lean = 0.06 + kind * 0.05;
  const heading = kind * Math.PI * 14;
  const dx = Math.sin(heading);
  const dz = Math.cos(heading);
  const segments = 3;
  for (let k = 0; k < segments; k += 1) {
    const along = (k + 0.5) / segments;
    const width = 0.42 - along * 0.14;
    batch.add({
      kind: 'cylinder',
      finish: 'flat',
      sx: width,
      // Overlapped, so the lean does not open gaps between segments.
      sy: (height / segments) * 1.25,
      sz: width,
      x: x + dx * Math.sin(lean) * height * along * along,
      y: y + height * along,
      z: z + dz * Math.sin(lean) * height * along * along,
      yaw: heading,
      pitch: lean * along * 2,
      color: 0x5a4c3e,
      roughness: 0.95,
      metalness: 0,
      emissive: 0,
      castShadow: true,
      chunk,
      lod: 'always',
    });
  }
  const topX = x + dx * Math.sin(lean) * height;
  const topZ = z + dz * Math.sin(lean) * height;
  for (const [turn, scale] of [
    [0, 3.2],
    [2.1, 2.7],
  ] as const) {
    batch.add(
      centered(PROPS.fern, topX, y + height - 0.4, topZ, heading + turn, scale, chunk, 'always'),
    );
  }
}

function addLamp(
  batch: CityBatcher,
  x: number,
  y: number,
  z: number,
  yaw: number,
  chunk: number,
): void {
  // The Poly Haven lamp is 3.9 m; avenues want about 4.6.
  batch.add(prop(PROPS.lamp, x, y, z, yaw, 1.2, chunk, 'always'));
}

function addParked(
  batch: CityBatcher,
  colliders: BoxCollider[],
  x: number,
  y: number,
  z: number,
  yaw: number,
  chunk: number,
  rng: () => number,
): void {
  const color = carColors[Math.floor(rng() * carColors.length)] ?? 0xf4f1ea;
  const scale = 0.85 + rng() * 0.2;
  // The traffic body: its origin is the tires, so it sits on the lifted street.
  batch.add({ ...prop(PARKED_CAR, x, y + STREET_LIFT, z, yaw, scale, chunk), color });
  colliders.push({
    x,
    y: y + 0.7,
    z,
    hx: 0.85 * scale,
    hy: 0.7,
    hz: 2.05 * scale,
    yaw,
    pitch: 0,
    chunk,
  });
}

/**
 * A bus shelter on the right of a street running along `yaw`: back panel, two side
 * panels, a roof, the bench and a sign pole. The open side faces the curb.
 */
function addShelter(
  batch: CityBatcher,
  x: number,
  y: number,
  z: number,
  yaw: number,
  chunk: number,
): void {
  // Along the street, and away from it (the street lies to the shelter's left).
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const ox = Math.cos(yaw);
  const oz = -Math.sin(yaw);
  const glass = { color: 0xb8d4dc, roughness: 0.08, metalness: 0.3 };
  const steel = { color: 0x3a3d40, roughness: 0.45, metalness: 0.6 };
  /** Sizes are [away, up, along], so local X points away from the street. */
  const box = (
    along: number,
    away: number,
    height: number,
    size: [number, number, number],
    look: { color: number; roughness: number; metalness: number },
    castShadow: boolean,
  ) => {
    batch.add({
      kind: 'box',
      finish: 'flat',
      sx: size[0],
      sy: size[1],
      sz: size[2],
      x: x + fx * along + ox * away,
      y: y + height,
      z: z + fz * along + oz * away,
      yaw,
      pitch: 0,
      emissive: 0,
      chunk,
      lod: 'near',
      castShadow,
      ...look,
    });
  };
  box(0, 0.65, 1.25, [0.06, 2.1, 3.4], glass, false);
  for (const along of [-1.6, 1.6]) box(along, 0, 1.2, [1.4, 2.4, 0.08], steel, true);
  box(0, 0.05, 2.45, [1.6, 0.1, 3.6], { color: 0xc4553a, roughness: 0.6, metalness: 0.1 }, true);
  // The bench kit's long axis is its local X; a quarter turn lays it along the street.
  batch.add({
    ...prop(PROPS.bench, x + ox * 0.3, y, z + oz * 0.3, yaw + Math.PI / 2, 1, chunk),
    sx: 0.55,
  });
  box(2.4, -0.4, 1.4, [0.08, 2.8, 0.08], steel, false);
  box(
    2.4,
    -0.4,
    2.65,
    [0.5, 0.5, 0.05],
    { color: 0x2f6d8a, roughness: 0.4, metalness: 0.2 },
    false,
  );
}

const canvasColors = [0xc4553a, 0x2f6d8a, 0x3d7a45, 0xe9c46a];

/** A market stall: a table on four legs under a sloping canvas. */
function addStall(
  batch: CityBatcher,
  x: number,
  y: number,
  z: number,
  yaw: number,
  chunk: number,
  seed: number,
): void {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const wood = { color: 0x8a5a32, roughness: 0.85, metalness: 0 };
  const part = (
    side: number,
    out: number,
    height: number,
    size: [number, number, number],
    look: { color: number; roughness: number; metalness: number },
    pitch = 0,
  ) => {
    batch.add({
      kind: 'box',
      finish: 'flat',
      sx: size[0],
      sy: size[1],
      sz: size[2],
      x: x + rx * side + fx * out,
      y: y + height,
      z: z + rz * side + fz * out,
      yaw,
      pitch,
      emissive: 0,
      castShadow: true,
      chunk,
      lod: 'near',
      ...look,
    });
  };
  part(0, 0, 0.9, [1.9, 0.08, 1.0], wood);
  for (const side of [-0.85, 0.85]) {
    for (const out of [-0.42, 0.42]) part(side, out, 1.1, [0.06, 2.2, 0.06], wood);
  }
  const canvas = canvasColors[seed % canvasColors.length] ?? 0xc4553a;
  part(0, 0.1, 2.2, [2.2, 0.04, 1.5], { color: canvas, roughness: 0.9, metalness: 0 }, -0.2);
  // Fruit on the table: a few bright boxes standing in for produce.
  for (const [side, tint] of [
    [-0.55, 0xe07a2a],
    [0, 0x6aa84f],
    [0.55, 0xd94141],
  ] as const) {
    part(side, 0, 1.02, [0.45, 0.16, 0.6], { color: tint, roughness: 0.7, metalness: 0 });
  }
}

function addBench(
  batch: CityBatcher,
  x: number,
  y: number,
  z: number,
  yaw: number,
  chunk: number,
): void {
  // The seating kit is 4.3 m of modules side by side; scaled, it reads as one long bench.
  // Shortened along its length only: scaled whole, the seat sank to shin height.
  batch.add({ ...prop(PROPS.bench, x, y, z, yaw + Math.PI / 2, 1, chunk), sx: 0.6 });
}

function addBin(
  batch: CityBatcher,
  x: number,
  y: number,
  z: number,
  yaw: number,
  chunk: number,
): void {
  batch.add(prop(PROPS.trashCan, x, y, z, yaw, 0.8, chunk));
}

function flat(
  finish: 'flat' | 'grass' | 'sidewalk' | 'concrete' | 'plaza',
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  color: number,
  chunk: number,
) {
  return {
    kind: 'box' as const,
    finish,
    sx,
    sy,
    sz,
    x,
    y,
    z,
    yaw,
    pitch: 0,
    color,
    roughness: finish === 'flat' ? 0.7 : 0.9,
    metalness: 0,
    emissive: 0,
    // Ground pads lie flat; posts, stalls and parked cars stand up.
    castShadow: finish === 'flat' || finish === 'concrete',
    chunk,
    lod: 'always' as const,
  };
}

function prop(
  model: string,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale: number,
  chunk: number,
  lod: MeshLod = 'near',
): Stamp {
  return {
    kind: 'model',
    model,
    finish: 'flat',
    sx: scale,
    sy: scale,
    sz: scale,
    x,
    y,
    z,
    yaw,
    pitch: 0,
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    emissive: 0,
    castShadow: true,
    chunk,
    lod,
  };
}

/** A box standing on the ground at (x, y, z): half sizes across, up and along `yaw`. */
function solid(
  list: BoxCollider[],
  x: number,
  y: number,
  z: number,
  yaw: number,
  hx: number,
  hy: number,
  hz: number,
): void {
  // Its own chunk, not its slot's: a hydrant 1.6 m along the curb can cross a border.
  list.push({ x, y: y + hy, z, hx, hy, hz, yaw, pitch: 0, chunk: chunkIndex(x, z) });
}
