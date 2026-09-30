/** Sidewalk agents: idle, walk, wait, cross, flee. Paths come from the navmesh. */

import type { World } from 'bitecs';
import { buildCostaVerde } from '../../content/city';
import { sampleHeight } from '../../content/map/island-shape';
import type { WalkQuad } from '../../content/map/road-mesh';
import { characterScale } from '../../content/models';
import type { GameContext } from '../../engine/core/context';
import { quatFromYaw } from '../../engine/core/math';
import { CAP, CameraRig, Pedestrian, Player, Traffic, Transform, Vehicle } from '../ecs/components';
import { syncCrowd } from '../features/pedestrians/crowd';
import { pedestrians, players, traffic } from '../ecs/queries';
import {
  COUNTER_DAMAGE,
  HURT_SECONDS,
  PedState,
  applyDamage,
  canCross,
  hurtRemaining,
  nightFactor,
  punchHits,
  shouldFlee,
} from './ped-ai';
import { Mode } from './player-movement';

const POINTS = 12;
const pathX = new Float32Array(CAP * POINTS);
const pathZ = new Float32Array(CAP * POINTS);
const rot = { x: 0, y: 0, z: 0, w: 1 };
let salt = 3;

export function pedestrianSystem(ctx: GameContext, world: World): void {
  const city = buildCostaVerde();
  const dt = ctx.time.fixedDt;
  let px = 0;
  let pz = 12;
  let carX = 0;
  let carZ = 0;
  let carSpeed = 0;
  let driving = false;
  let punch = false;
  let facing = 0;
  let playerEid = -1;
  let punchDamage = 2;
  for (const eid of players(world)) {
    px = Transform.px[eid] ?? 0;
    pz = Transform.pz[eid] ?? 0;
    facing = Player.facing[eid] ?? 0;
    playerEid = eid;
    punch = Player.mode[eid] === Mode.OnFoot && Player.strike[eid] === 1;
    punchDamage = Player.punchPower[eid] ?? 2;
    if (Player.mode[eid] === Mode.Driving) {
      driving = true;
      const vehicleEid = Player.vehicle[eid] ?? 0;
      carX = Transform.px[vehicleEid] ?? px;
      carZ = Transform.pz[vehicleEid] ?? pz;
      carSpeed = Math.abs(Vehicle.speed[vehicleEid] ?? 0);
    }
    break;
  }
  let active = 0;
  for (const eid of pedestrians(world)) {
    if ((Pedestrian.active[eid] ?? 0) === 0) continue;
    if ((Pedestrian.driving[eid] ?? 0) === 1) {
      active += 1;
      continue;
    }
    const dx = (Transform.px[eid] ?? 0) - px;
    const dz = (Transform.pz[eid] ?? 0) - pz;
    if (Math.hypot(dx, dz) > 95) {
      Pedestrian.active[eid] = 0;
      continue;
    }
    const toCar = Math.hypot((Transform.px[eid] ?? 0) - carX, (Transform.pz[eid] ?? 0) - carZ);
    const fleeing = driving && shouldFlee(carSpeed, toCar, toCar < 1.7);
    if (fleeing && (Pedestrian.state[eid] ?? 0) !== PedState.Flee) {
      if (toCar < 1.7) ctx.events.emit('pedestrian:hit', { pedestrian: eid, speed: carSpeed });
      Pedestrian.state[eid] = PedState.Flee;
      Pedestrian.wait[eid] = 3.2;
      const away = Math.atan2((Transform.px[eid] ?? 0) - carX, (Transform.pz[eid] ?? 0) - carZ);
      Pedestrian.tx[eid] = (Transform.px[eid] ?? 0) + Math.sin(away) * 8;
      Pedestrian.tz[eid] = (Transform.pz[eid] ?? 0) + Math.cos(away) * 8;
    }
    step(ctx, world, city.walks, eid, dt, px, pz, playerEid, driving);
    if ((Pedestrian.health[eid] ?? 0) > 0) active += 1;
  }
  const target = Math.min(
    120,
    Math.round(100 * ctx.debug.pedDensity * nightFactor(ctx.renderer.timeOfDay())),
  );
  let guard = 0;
  while (active < target && guard < 4) {
    guard += 1;
    const eid = inactive(world);
    if (eid < 0 || !wake(eid, px, pz)) break;
    active += 1;
  }
  if (punch) connectPunch(ctx, world, px, pz, facing, punchDamage);
  if (playerEid >= 0) Player.strike[playerEid] = 0;
  ctx.debug.npcs = active;
}

export function pedestrianVisual(ctx: GameContext, world: World): void {
  let px = 0;
  let pz = 12;
  let yaw = Math.PI;
  for (const eid of players(world)) {
    px = Transform.px[eid] ?? 0;
    pz = Transform.pz[eid] ?? 0;
    yaw = CameraRig.yaw[eid] ?? yaw;
    break;
  }
  syncCrowd(ctx, world, px, pz, yaw);
}

function step(
  ctx: GameContext,
  world: World,
  walks: WalkQuad[],
  eid: number,
  dt: number,
  px: number,
  pz: number,
  playerEid: number,
  playerDriving: boolean,
): void {
  Pedestrian.hurt[eid] = hurtRemaining(Pedestrian.hurt[eid] ?? 0, dt);
  Pedestrian.swing[eid] = hurtRemaining(Pedestrian.swing[eid] ?? 0, dt);
  if ((Pedestrian.health[eid] ?? 0) <= 0) {
    Pedestrian.state[eid] = PedState.Down;
    Pedestrian.speed[eid] = 0;
    Transform.ppx[eid] = Transform.px[eid] ?? 0;
    Transform.ppy[eid] = Transform.py[eid] ?? 0;
    Transform.ppz[eid] = Transform.pz[eid] ?? 0;
    Transform.pqx[eid] = Transform.qx[eid] ?? 0;
    Transform.pqy[eid] = Transform.qy[eid] ?? 0;
    Transform.pqz[eid] = Transform.qz[eid] ?? 0;
    Transform.pqw[eid] = Transform.qw[eid] ?? 1;
    return;
  }
  const state = Pedestrian.state[eid] ?? 0;
  if (state === PedState.Fight) {
    fight(eid, dt, px, pz, playerEid, playerDriving);
    return;
  }
  if (state === PedState.Idle) {
    Pedestrian.speed[eid] = 0;
    Pedestrian.wait[eid] = (Pedestrian.wait[eid] ?? 0) - dt;
    if ((Pedestrian.wait[eid] ?? 0) > 0) return;
    if (!aim(ctx, eid)) {
      Pedestrian.wait[eid] = 1;
      return;
    }
    Pedestrian.state[eid] = PedState.Walk;
    return;
  }
  if (state === PedState.Flee) {
    Pedestrian.wait[eid] = (Pedestrian.wait[eid] ?? 0) - dt;
    const arrived = slide(eid, Pedestrian.tx[eid] ?? 0, Pedestrian.tz[eid] ?? 0, 4.4, dt);
    if (arrived || (Pedestrian.wait[eid] ?? 0) <= 0) {
      Pedestrian.state[eid] = PedState.Idle;
      Pedestrian.wait[eid] = 0.6;
    }
    return;
  }
  if (state === PedState.Wait) {
    Pedestrian.speed[eid] = 0;
    Pedestrian.wait[eid] = (Pedestrian.wait[eid] ?? 0) - dt;
    if ((Pedestrian.wait[eid] ?? 0) > 0) return;
    if (!canCross(carClose(world, Transform.px[eid] ?? 0, Transform.pz[eid] ?? 0))) {
      Pedestrian.wait[eid] = 0.35;
      return;
    }
    Pedestrian.state[eid] = PedState.Cross;
    return;
  }
  const speed = state === PedState.Cross ? 1.7 : 1.25;
  const index = Pedestrian.path[eid] ?? 0;
  const count = Pedestrian.count[eid] ?? 0;
  const tx = count > 0 ? (pathX[eid * POINTS + index] ?? 0) : (Pedestrian.tx[eid] ?? px);
  const tz = count > 0 ? (pathZ[eid * POINTS + index] ?? 0) : (Pedestrian.tz[eid] ?? pz);
  if (!slide(eid, tx, tz, speed, dt)) return;
  const next = index + 1;
  if (count > 0 && next < count) {
    Pedestrian.path[eid] = next;
    const mx = ((Transform.px[eid] ?? 0) + (pathX[eid * POINTS + next] ?? 0)) / 2;
    const mz = ((Transform.pz[eid] ?? 0) + (pathZ[eid * POINTS + next] ?? 0)) / 2;
    if (insideCross(walks, mx, mz)) {
      Pedestrian.state[eid] = PedState.Wait;
      Pedestrian.wait[eid] = 0.4;
    } else if (state === PedState.Cross) Pedestrian.state[eid] = PedState.Walk;
    return;
  }
  Pedestrian.state[eid] = PedState.Idle;
  Pedestrian.wait[eid] = 0.8 + (eid % 5) * 0.3;
  Pedestrian.count[eid] = 0;
  Pedestrian.speed[eid] = 0;
}

function aim(ctx: GameContext, eid: number): boolean {
  const city = buildCostaVerde();
  const pois = city.pois;
  if (pois.length === 0) return false;
  salt = (salt * 13 + eid + 7) % 10007;
  const poi = pois[salt % pois.length];
  if (!poi) return false;
  const x = Transform.px[eid] ?? 0;
  const z = Transform.pz[eid] ?? 0;
  const y = Transform.py[eid] ?? 0;
  const count = ctx.nav.find(
    x,
    y,
    z,
    poi.x,
    sampleHeight(poi.x, poi.z),
    poi.z,
    pathX,
    pathZ,
    eid * POINTS,
    POINTS,
  );
  Pedestrian.count[eid] = count;
  Pedestrian.path[eid] = 0;
  if (count > 0) return true;
  Pedestrian.tx[eid] = poi.x;
  Pedestrian.tz[eid] = poi.z;
  return Math.hypot(poi.x - x, poi.z - z) < 80;
}

function wake(eid: number, px: number, pz: number): boolean {
  const walks = buildCostaVerde().walks;
  salt = (salt * 17 + 3) % 10007;
  for (let n = 0; n < 24; n += 1) {
    const quad = walks[(salt + n) % walks.length];
    if (!quad || quad.crosswalk) continue;
    const x = (quad.ax + quad.cx) / 2;
    const z = (quad.az + quad.cz) / 2;
    const distance = Math.hypot(x - px, z - pz);
    if (distance < 18 || distance > 70) continue;
    const y = sampleHeight(x, z);
    if (y < 1) continue;
    Transform.ppx[eid] = x;
    Transform.ppy[eid] = y;
    Transform.ppz[eid] = z;
    Transform.px[eid] = x;
    Transform.py[eid] = y;
    Transform.pz[eid] = z;
    Pedestrian.active[eid] = 1;
    Pedestrian.driving[eid] = 0;
    Pedestrian.car[eid] = 0;
    Pedestrian.state[eid] = PedState.Idle;
    Pedestrian.wait[eid] = (salt % 8) * 0.15;
    Pedestrian.count[eid] = 0;
    Pedestrian.health[eid] = 10;
    Pedestrian.hurt[eid] = 0;
    Pedestrian.cool[eid] = 0;
    Pedestrian.swing[eid] = 0;
    Pedestrian.speed[eid] = 0;
    Pedestrian.corpse[eid] = 0;
    return true;
  }
  return false;
}

function slide(eid: number, tx: number, tz: number, speed: number, dt: number): boolean {
  const x = Transform.px[eid] ?? 0;
  const z = Transform.pz[eid] ?? 0;
  const dx = tx - x;
  const dz = tz - z;
  const len = Math.hypot(dx, dz);
  Transform.ppx[eid] = x;
  Transform.ppy[eid] = Transform.py[eid] ?? 0;
  Transform.ppz[eid] = z;
  Transform.pqx[eid] = Transform.qx[eid] ?? 0;
  Transform.pqy[eid] = Transform.qy[eid] ?? 0;
  Transform.pqz[eid] = Transform.qz[eid] ?? 0;
  Transform.pqw[eid] = Transform.qw[eid] ?? 1;
  if (len < 0.45) return true;
  const stepDistance = Math.min(len, speed * dt);
  const nx = x + (dx / len) * stepDistance;
  const nz = z + (dz / len) * stepDistance;
  Transform.px[eid] = nx;
  Transform.pz[eid] = nz;
  Transform.py[eid] = sampleHeight(nx, nz);
  Pedestrian.yaw[eid] = Math.atan2(dx, dz);
  Pedestrian.speed[eid] = speed;
  quatFromYaw(Pedestrian.yaw[eid] ?? 0, rot);
  Transform.qx[eid] = rot.x;
  Transform.qy[eid] = rot.y;
  Transform.qz[eid] = rot.z;
  Transform.qw[eid] = rot.w;
  return false;
}

function carClose(world: World, x: number, z: number): boolean {
  for (const eid of traffic(world)) {
    if ((Traffic.active[eid] ?? 0) === 0) continue;
    const dx = (Transform.px[eid] ?? 0) - x;
    const dz = (Transform.pz[eid] ?? 0) - z;
    if (dx * dx + dz * dz < 16 * 16) return true;
  }
  return false;
}

function insideCross(walks: WalkQuad[], x: number, z: number): boolean {
  for (let i = 0; i < walks.length; i += 1) {
    const quad = walks[i];
    if (!quad?.crosswalk) continue;
    const midX = (quad.ax + quad.cx) / 2;
    const midZ = (quad.az + quad.cz) / 2;
    if (Math.hypot(midX - x, midZ - z) > 22) continue;
    if (
      pointInTri(x, z, quad.ax, quad.az, quad.bx, quad.bz, quad.cx, quad.cz) ||
      pointInTri(x, z, quad.ax, quad.az, quad.cx, quad.cz, quad.dx, quad.dz)
    ) {
      return true;
    }
  }
  return false;
}

function pointInTri(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): boolean {
  const c1 = (bx - ax) * (pz - az) - (bz - az) * (px - ax);
  const c2 = (cx - bx) * (pz - bz) - (cz - bz) * (px - bx);
  const c3 = (ax - cx) * (pz - cz) - (az - cz) * (px - cx);
  return (c1 >= 0 && c2 >= 0 && c3 >= 0) || (c1 <= 0 && c2 <= 0 && c3 <= 0);
}

function inactive(world: World): number {
  for (const eid of pedestrians(world)) {
    if ((Pedestrian.active[eid] ?? 0) === 0) return eid;
  }
  return -1;
}

const PUNCH_REACH = 1.85;
const FIGHT_REACH = 1.7;

function fight(
  eid: number,
  dt: number,
  px: number,
  pz: number,
  playerEid: number,
  playerDriving: boolean,
): void {
  const x = Transform.px[eid] ?? 0;
  const z = Transform.pz[eid] ?? 0;
  const dx = px - x;
  const dz = pz - z;
  const distance = Math.hypot(dx, dz);
  Pedestrian.cool[eid] = hurtRemaining(Pedestrian.cool[eid] ?? 0, dt);
  const playerDown = playerEid < 0 || (Player.health[playerEid] ?? 0) <= 0;
  if (playerDriving || playerDown || distance > 9) {
    Pedestrian.state[eid] = PedState.Idle;
    Pedestrian.speed[eid] = 0;
    Pedestrian.wait[eid] = 0.4;
    return;
  }
  if (distance > FIGHT_REACH) {
    slide(eid, px, pz, 2.6, dt);
    return;
  }
  Pedestrian.speed[eid] = 0;
  Pedestrian.yaw[eid] = Math.atan2(dx, dz);
  quatFromYaw(Pedestrian.yaw[eid] ?? 0, rot);
  Transform.qx[eid] = rot.x;
  Transform.qy[eid] = rot.y;
  Transform.qz[eid] = rot.z;
  Transform.qw[eid] = rot.w;
  if ((Pedestrian.cool[eid] ?? 0) > 0) return;
  Player.health[playerEid] = applyDamage(Player.health[playerEid] ?? 10, COUNTER_DAMAGE);
  Pedestrian.cool[eid] = 1.05;
  Pedestrian.swing[eid] = 0.48;
  Pedestrian.swingId[eid] = (Pedestrian.swingId[eid] ?? 0) + 1;
}

function connectPunch(
  ctx: GameContext,
  world: World,
  px: number,
  pz: number,
  facing: number,
  damage: number,
): void {
  let best = -1;
  let bestDistance = PUNCH_REACH;
  for (const eid of pedestrians(world)) {
    if ((Pedestrian.active[eid] ?? 0) === 0 || (Pedestrian.driving[eid] ?? 0) === 1) continue;
    const tx = Transform.px[eid] ?? 0;
    const tz = Transform.pz[eid] ?? 0;
    if (!punchHits(px, pz, facing, tx, tz, PUNCH_REACH)) continue;
    const distance = Math.hypot(tx - px, tz - pz);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = eid;
    }
  }
  if (best < 0) return;
  const tx = Transform.px[best] ?? px;
  const tz = Transform.pz[best] ?? pz;
  const away = Math.atan2(tx - px, tz - pz);
  const nx = Math.sin(away);
  const nz = Math.cos(away);
  const x = tx + nx * 0.7;
  const z = tz + nz * 0.7;
  const y = sampleHeight(x, z);
  Transform.ppx[best] = tx;
  Transform.ppz[best] = tz;
  Transform.ppy[best] = Transform.py[best] ?? y;
  Transform.px[best] = x;
  Transform.pz[best] = z;
  Transform.py[best] = y;
  const health = applyDamage(Pedestrian.health[best] ?? 10, damage);
  Pedestrian.health[best] = health;
  Pedestrian.hurt[best] = HURT_SECONDS;
  Pedestrian.speed[best] = 0;
  if (health <= 0) {
    Pedestrian.state[best] = PedState.Down;
  } else {
    Pedestrian.state[best] = PedState.Fight;
    Pedestrian.cool[best] = 0.45;
    Pedestrian.swingId[best] = (Pedestrian.swingId[best] ?? 0) + 1;
  }
  ctx.events.emit('pedestrian:hit', { pedestrian: best, speed: 0 });
}

/** Puts a free pedestrian in the driver's seat. Returns false when the pool is full. */
export function attachDriver(
  world: World,
  car: number,
  x: number,
  ground: number,
  z: number,
  yaw: number,
  scale: number,
): boolean {
  if (driverOf(world, car) >= 0) return true;
  const eid = inactive(world);
  if (eid < 0) return false;
  Pedestrian.active[eid] = 1;
  Pedestrian.driving[eid] = 1;
  Pedestrian.car[eid] = car;
  Pedestrian.state[eid] = PedState.Idle;
  Pedestrian.count[eid] = 0;
  Pedestrian.health[eid] = 10;
  Pedestrian.hurt[eid] = 0;
  placeDriver(eid, x, ground, z, yaw, scale);
  return true;
}

export function seatDriver(
  world: World,
  car: number,
  x: number,
  ground: number,
  z: number,
  yaw: number,
  scale: number,
): void {
  const eid = driverOf(world, car);
  if (eid < 0) return;
  placeDriver(eid, x, ground, z, yaw, scale);
}

/** Pulls the driver out of the door and sends them running. */
export function ejectDriver(world: World, car: number, x: number, z: number, yaw: number): void {
  const eid = driverOf(world, car);
  if (eid < 0) return;
  const side = yaw + Math.PI / 2;
  const px = x + Math.sin(side) * 1.6;
  const pz = z + Math.cos(side) * 1.6;
  const y = sampleHeight(px, pz);
  Pedestrian.driving[eid] = 0;
  Pedestrian.car[eid] = 0;
  Pedestrian.active[eid] = 1;
  Pedestrian.state[eid] = PedState.Flee;
  Pedestrian.wait[eid] = 2.4;
  Pedestrian.count[eid] = 0;
  Pedestrian.tx[eid] = px + Math.sin(side) * 8;
  Pedestrian.tz[eid] = pz + Math.cos(side) * 8;
  Transform.ppx[eid] = px;
  Transform.ppy[eid] = y;
  Transform.ppz[eid] = pz;
  Transform.px[eid] = px;
  Transform.py[eid] = y;
  Transform.pz[eid] = pz;
  Pedestrian.yaw[eid] = side;
  quatFromYaw(side, rot);
  Transform.qx[eid] = rot.x;
  Transform.qy[eid] = rot.y;
  Transform.qz[eid] = rot.z;
  Transform.qw[eid] = rot.w;
  Transform.pqx[eid] = rot.x;
  Transform.pqy[eid] = rot.y;
  Transform.pqz[eid] = rot.z;
  Transform.pqw[eid] = rot.w;
}

export function releaseDriver(world: World, car: number): void {
  const eid = driverOf(world, car);
  if (eid < 0) return;
  Pedestrian.driving[eid] = 0;
  Pedestrian.car[eid] = 0;
  Pedestrian.active[eid] = 0;
}

function driverOf(world: World, car: number): number {
  for (const eid of pedestrians(world)) {
    if ((Pedestrian.driving[eid] ?? 0) === 1 && (Pedestrian.car[eid] ?? 0) === car) return eid;
  }
  return -1;
}

/** car.glb roof height before the traffic scale. The sit clip does not lower the torso. */
const CABIN_ROOF = 1.183;
const STANDING_HEIGHT = 4.845 * characterScale;

function placeDriver(
  eid: number,
  x: number,
  ground: number,
  z: number,
  yaw: number,
  scale: number,
): void {
  // +X is the model's left seat, +Z is the hood.
  const lx = 0.36 * scale;
  const lz = 0.42 * scale;
  const px = x + Math.cos(yaw) * lx + Math.sin(yaw) * lz;
  const pz = z - Math.sin(yaw) * lx + Math.cos(yaw) * lz;
  // Root drops so the head meets the roof. The crowd mesh adds STREET_LIFT on top.
  const py = ground + CABIN_ROOF * scale - STANDING_HEIGHT - 0.08;
  Transform.px[eid] = px;
  Transform.py[eid] = py;
  Transform.pz[eid] = pz;
  Transform.ppx[eid] = px;
  Transform.ppy[eid] = py;
  Transform.ppz[eid] = pz;
  Pedestrian.yaw[eid] = yaw;
  quatFromYaw(yaw, rot);
  Transform.qx[eid] = rot.x;
  Transform.qy[eid] = rot.y;
  Transform.qz[eid] = rot.z;
  Transform.qw[eid] = rot.w;
  Transform.pqx[eid] = rot.x;
  Transform.pqy[eid] = rot.y;
  Transform.pqz[eid] = rot.z;
  Transform.pqw[eid] = rot.w;
}
