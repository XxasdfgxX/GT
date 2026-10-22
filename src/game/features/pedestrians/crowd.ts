/** Near pedestrians are skinned clones of ten citizen models. Everyone else is a capsule. */

import { addComponent, addEntity, type World } from 'bitecs';
import { characterAlignYaw, citizens } from '../../../content/models';
import { STREET_LIFT } from '../../../content/map/road-mesh';
import { sim } from '../../../content/sim';
import type { GameContext } from '../../context';
import { writeTransformMatrix } from '../../../engine/core/math';
import type { ClipKey } from '../../../engine/render/renderer';
import { Pedestrian, RenderRef, Transform, writePose } from '../../ecs/components';
import { PedState, healthBarVisible } from '../../../sim/ped-ai';
import { pedestrians } from '../../ecs/queries';
import { HEALTH_TRACK_WIDTH, healthFillLayout } from '../health-bar';

export const PED_POOL = 120;
export const NEAR_SLOTS = 24;

const farTint = [
  0xc47a3a, 0xd64545, 0x2f4f8a, 0x8a3d2f, 0x3d6b45, 0x7a4ea3, 0x2f8a7a, 0xe07a9a, 0xc45a78,
  0xd4a017,
];

const nearMesh: number[] = [];
const slotVariant = new Uint8Array(NEAR_SLOTS);
const nearPed = new Int16Array(NEAR_SLOTS);
const chosen = new Int16Array(NEAR_SLOTS);
const chosenD = new Float32Array(NEAR_SLOTS);
const used = new Uint8Array(2048);
const matrices = new Float32Array(PED_POOL * 16);
const colors = new Float32Array(PED_POOL * 3);
const barMatrices = new Float32Array(PED_POOL * 16);
const barFill = new Float32Array(PED_POOL * 16);
const barColors = new Float32Array(PED_POOL * 3);
const fillColors = new Float32Array(PED_POOL * 3);
const bloodMatrices = new Float32Array(PED_POOL * 16);
const bloodColors = new Float32Array(PED_POOL * 3);
let crowdMesh = 0;
let barMesh = 0;
let fillMesh = 0;
let bloodMesh = 0;

/** Mesh ids belong to the last renderer. A multiplayer session never spawns the crowd. */
export function resetCrowd(): void {
  nearMesh.length = 0;
  nearPed.fill(-1);
  crowdMesh = 0;
  barMesh = 0;
  fillMesh = 0;
  bloodMesh = 0;
}

export function spawnPedCrowd(ctx: GameContext, world: World): void {
  nearMesh.length = 0;
  for (let i = 0; i < NEAR_SLOTS; i += 1) {
    nearPed[i] = -1;
    slotVariant[i] = i % citizens.length;
  }
  for (let i = 0; i < PED_POOL; i += 1) {
    const eid = addEntity(world);
    addComponent(world, eid, Pedestrian);
    addComponent(world, eid, Transform);
    addComponent(world, eid, RenderRef);
    writePose(eid, 0, -30, 0);
    Pedestrian.active[eid] = 0;
    Pedestrian.variant[eid] = i % citizens.length;
    Pedestrian.state[eid] = 0;
    Pedestrian.path[eid] = 0;
    Pedestrian.count[eid] = 0;
    Pedestrian.health[eid] = sim.maxHealth;
    RenderRef.mesh[eid] = 0;
  }
  for (let i = 0; i < NEAR_SLOTS; i += 1) {
    const person = citizens[slotVariant[i] ?? 0] ?? citizens[0];
    const mesh = ctx.renderer.addModel({
      url: person.url,
      position: { x: 0, y: -30, z: 0 },
      scale: person.scale,
      alignYaw: characterAlignYaw,
      offset: { x: 0, y: STREET_LIFT + person.lift, z: 0 },
      clips: person.clips,
      ...('clipSource' in person ? { clipSource: person.clipSource } : {}),
    });
    ctx.renderer.setMeshVisible(mesh, false);
    nearMesh.push(mesh);
  }
  colors.fill(1);
  crowdMesh = ctx.renderer.addInstances({
    kind: 'cylinder',
    unit: true,
    size: { x: 1, y: 1, z: 1 },
    color: 0xffffff,
    count: PED_POOL,
    matrices,
    colors,
    roughness: 0.7,
    metalness: 0,
    castShadow: false,
  });
  ctx.renderer.setMeshVisible(crowdMesh, false);
  barColors.fill(0.08);
  barMesh = ctx.renderer.addInstances({
    kind: 'box',
    unit: true,
    size: { x: 1, y: 1, z: 1 },
    color: 0x151515,
    count: PED_POOL,
    matrices: barMatrices,
    colors: barColors,
    roughness: 0.4,
    metalness: 0,
    castShadow: false,
  });
  fillMesh = ctx.renderer.addInstances({
    kind: 'box',
    unit: true,
    size: { x: 1, y: 1, z: 1 },
    color: 0x3dba5a,
    count: PED_POOL,
    matrices: barFill,
    colors: fillColors,
    roughness: 0.35,
    metalness: 0,
    castShadow: false,
  });
  ctx.renderer.setMeshVisible(barMesh, false);
  ctx.renderer.setMeshVisible(fillMesh, false);
  bloodColors.fill(1);
  bloodMesh = ctx.renderer.addInstances({
    kind: 'box',
    unit: true,
    size: { x: 1, y: 1, z: 1 },
    color: 0x7c1418,
    count: PED_POOL,
    matrices: bloodMatrices,
    colors: bloodColors,
    roughness: 1,
    metalness: 0,
    castShadow: false,
  });
  ctx.renderer.setMeshVisible(bloodMesh, false);
}

/** Gives the closest pedestrians a matching body and parks the rest on the instance batch. */
export function syncCrowd(
  ctx: GameContext,
  world: World,
  px: number,
  pz: number,
  cameraYaw: number,
): void {
  chosen.fill(-1);
  chosenD.fill(1e9);
  for (const eid of pedestrians(world)) {
    if ((Pedestrian.active[eid] ?? 0) === 0) continue;
    const dx = (Transform.px[eid] ?? 0) - px;
    const dz = (Transform.pz[eid] ?? 0) - pz;
    const dead = (Pedestrian.health[eid] ?? 0) <= 0;
    const distance = dx * dx + dz * dz - (dead ? 24 * 24 : 0);
    if (dx * dx + dz * dz > 40 * 40) continue;
    const variant = (Pedestrian.variant[eid] ?? 0) % citizens.length;
    let slot = -1;
    let worst = -1;
    for (let i = 0; i < NEAR_SLOTS; i += 1) {
      if ((slotVariant[i] ?? 0) !== variant) continue;
      if ((chosen[i] ?? -1) < 0) {
        slot = i;
        break;
      }
      if (worst < 0 || (chosenD[i] ?? 0) > (chosenD[worst] ?? 0)) worst = i;
    }
    if (slot < 0) slot = worst;
    if (slot < 0 || distance >= (chosenD[slot] ?? 0)) continue;
    chosen[slot] = eid;
    chosenD[slot] = distance;
  }
  used.fill(0);
  for (let i = 0; i < NEAR_SLOTS; i += 1) {
    const eid = chosen[i] ?? -1;
    const mesh = nearMesh[i] ?? 0;
    if (eid < 0 || mesh === 0) {
      nearPed[i] = -1;
      if (mesh) ctx.renderer.setMeshVisible(mesh, false);
      continue;
    }
    used[eid] = 1;
    nearPed[i] = eid;
    RenderRef.mesh[eid] = mesh;
    ctx.renderer.setMeshVisible(mesh, true);
    const clip = citizenClip(eid);
    const token =
      clip === 'punch' || clip === 'die'
        ? (Pedestrian.swingId[eid] ?? 0)
        : (Pedestrian.state[eid] ?? 0);
    ctx.renderer.playClip(mesh, clip, token);
  }
  let far = 0;
  for (const eid of pedestrians(world)) {
    if (used[eid] === 1) continue;
    // A slot this ped held last frame may belong to someone else now, drivers and the parked included.
    RenderRef.mesh[eid] = 0;
    if ((Pedestrian.active[eid] ?? 0) === 0 || (Pedestrian.driving[eid] ?? 0) === 1) continue;
    const tint = farTint[Pedestrian.variant[eid] ?? 0] ?? 0xf7f4ef;
    const dead = (Pedestrian.health[eid] ?? 0) <= 0;
    const y = (Transform.py[eid] ?? 0) + (dead ? 0.16 : 0.85) + STREET_LIFT;
    writeTransformMatrix(
      matrices,
      far,
      Transform.px[eid] ?? 0,
      y,
      Transform.pz[eid] ?? 0,
      Pedestrian.yaw[eid] ?? 0,
      0,
      dead ? 0.9 : 0.45,
      dead ? 0.28 : 1.7,
      dead ? 0.42 : 0.45,
    );
    colors[far * 3] = ((tint >> 16) & 255) / 255;
    colors[far * 3 + 1] = ((tint >> 8) & 255) / 255;
    colors[far * 3 + 2] = (tint & 255) / 255;
    far += 1;
  }
  ctx.renderer.setInstances(crowdMesh, matrices, colors, far);
  ctx.renderer.setMeshVisible(crowdMesh, far > 0);
  syncBlood(ctx, world);
  syncBars(ctx, world, cameraYaw);
}

function syncBlood(ctx: GameContext, world: World): void {
  let count = 0;
  for (const eid of pedestrians(world)) {
    if (count >= PED_POOL) break;
    if ((Pedestrian.active[eid] ?? 0) === 0 || (Pedestrian.health[eid] ?? 0) > 0) continue;
    const yaw = Pedestrian.yaw[eid] ?? 0;
    writeTransformMatrix(
      bloodMatrices,
      count,
      Transform.px[eid] ?? 0,
      (Transform.py[eid] ?? 0) + STREET_LIFT + 0.03,
      Transform.pz[eid] ?? 0,
      yaw,
      0,
      1.25,
      0.04,
      0.72,
    );
    bloodColors[count * 3] = 0.55;
    bloodColors[count * 3 + 1] = 0.06;
    bloodColors[count * 3 + 2] = 0.07;
    count += 1;
  }
  ctx.renderer.setInstances(bloodMesh, bloodMatrices, bloodColors, count);
  ctx.renderer.setMeshVisible(bloodMesh, count > 0);
}

function citizenClip(eid: number): ClipKey {
  if ((Pedestrian.driving[eid] ?? 0) === 1) return 'sit';
  if ((Pedestrian.health[eid] ?? 0) <= 0) return 'die';
  if ((Pedestrian.swing[eid] ?? 0) > 0) return 'punch';
  const state = Pedestrian.state[eid] ?? 0;
  if (state === PedState.Trip) return 'die';
  if (state === 4 || state === 3) return 'run';
  if ((Pedestrian.speed[eid] ?? 0) > 0.2) return 'walk';
  return 'idle';
}

function syncBars(ctx: GameContext, world: World, cameraYaw: number): void {
  let count = 0;
  for (const eid of pedestrians(world)) {
    if (count >= PED_POOL) break;
    if ((Pedestrian.active[eid] ?? 0) === 0 || (Pedestrian.driving[eid] ?? 0) === 1) continue;
    if ((Pedestrian.health[eid] ?? 0) <= 0) continue;
    if (!healthBarVisible(Pedestrian.hurt[eid] ?? 0)) continue;
    const hp = Math.max(0, Math.min(1, (Pedestrian.health[eid] ?? 0) / sim.maxHealth));
    const x = Transform.px[eid] ?? 0;
    const y = (Transform.py[eid] ?? 0) + 1.85;
    const z = Transform.pz[eid] ?? 0;
    const fill = healthFillLayout(hp, cameraYaw);
    writeTransformMatrix(
      barMatrices,
      count,
      x,
      y,
      z,
      cameraYaw,
      0,
      HEALTH_TRACK_WIDTH,
      0.09,
      0.045,
    );
    writeTransformMatrix(
      barFill,
      count,
      x + fill.x,
      y,
      z + fill.z,
      cameraYaw,
      0,
      fill.width,
      0.055,
      0.05,
    );
    fillColors[count * 3] = 0.9 * (1 - hp) + 0.15;
    fillColors[count * 3 + 1] = 0.75 * hp + 0.08;
    fillColors[count * 3 + 2] = 0.12;
    barColors[count * 3] = 0.08;
    barColors[count * 3 + 1] = 0.08;
    barColors[count * 3 + 2] = 0.09;
    count += 1;
  }
  ctx.renderer.setInstances(barMesh, barMatrices, barColors, count);
  ctx.renderer.setInstances(fillMesh, barFill, fillColors, count);
  ctx.renderer.setMeshVisible(barMesh, count > 0);
  ctx.renderer.setMeshVisible(fillMesh, count > 0);
}
