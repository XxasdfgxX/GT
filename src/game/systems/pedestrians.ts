/** Sidewalk agents: idle, walk, wait, cross, flee. Paths come from the navmesh. */

import { buildCostaVerde } from '../../content/city';
import { sampleHeight } from '../../content/map/island-shape';
import type { WalkQuad } from '../../content/map/road-mesh';
import type { GameContext } from '../context';
import {
  CameraRig,
  CAP,
  Mode,
  Pedestrian,
  Player,
  Transform,
  Vehicle,
  Velocity,
} from '../ecs/components';
import { pedestrians, players } from '../ecs/queries';
import { syncCrowd } from '../features/pedestrians/crowd';
import { bucketCrowd } from '../play/crowd-grid';
import { freshBody, idlePedestrian } from '../play/drivers';
import { BODY_REACH, circlesOverlap } from '../../sim/overlap';
import { playerFocus } from '../play/player-focus';
import type { World } from 'bitecs';
import { walkerShare } from '../../sim/city-life';
import { clockHours } from '../../sim/clock';
import { canCross, hurtRemaining, PedState, shouldFlee } from '../../sim/ped-ai';
import { connectPunch, fight, STUCK_SECONDS } from './ped-fight';
import { carClose, ramPedestrians } from './ped-ramming';
import { insideCross, shove, slide } from './ped-shove';

const POINTS = 12;

const pathX = new Float32Array(CAP * POINTS);

const pathZ = new Float32Array(CAP * POINTS);

export const rot = { x: 0, y: 0, z: 0, w: 1 };

let salt = 3;

export function pedestrianSystem(ctx: GameContext, world: World): void {
  const city = buildCostaVerde();
  bucketCrowd(world, ctx.time.tick);
  const dt = ctx.time.fixedDt;
  let carX = 0;
  let carZ = 0;
  let carSpeed = 0;
  let driving = false;
  let punch = false;
  let facing = 0;
  let playerEid = -1;
  let punchDamage = 2;
  let speed = 0;
  const focus = playerFocus(world);
  let px = focus.x;
  let pz = focus.z;
  for (const eid of players(world)) {
    facing = Player.facing[eid] ?? 0;
    playerEid = eid;
    speed = Math.hypot(Velocity.x[eid] ?? 0, Velocity.z[eid] ?? 0);
    punch = Player.mode[eid] === Mode.OnFoot && Player.strike[eid] === 1;
    punchDamage = Player.punchPower[eid] ?? 2;
    if (Player.mode[eid] === Mode.Driving) {
      driving = true;
      carX = px;
      carZ = pz;
      carSpeed = Math.abs(Vehicle.speed[Player.vehicle[eid] ?? 0] ?? 0);
    }
    break;
  }
  for (const eid of players(world)) {
    if (driving) ramPedestrians(ctx, world, Player.vehicle[eid] ?? 0, carSpeed);
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
    const alive = (Pedestrian.health[eid] ?? 0) > 0;
    const fleeing = alive && driving && shouldFlee(carSpeed, toCar, toCar < 1.7);
    if (fleeing && (Pedestrian.state[eid] ?? 0) !== PedState.Flee) {
      Pedestrian.state[eid] = PedState.Flee;
      Pedestrian.wait[eid] = 3.2;
      const away = Math.atan2((Transform.px[eid] ?? 0) - carX, (Transform.pz[eid] ?? 0) - carZ);
      Pedestrian.tx[eid] = (Transform.px[eid] ?? 0) + Math.sin(away) * 8;
      Pedestrian.tz[eid] = (Transform.pz[eid] ?? 0) + Math.cos(away) * 8;
    }
    step(ctx, world, city.walks, eid, dt, px, pz, playerEid, driving);
    if ((Pedestrian.health[eid] ?? 0) > 0) active += 1;
  }
  const foot = { x: px, z: pz };
  if (!driving && playerEid >= 0) shove(ctx, world, playerEid, foot, speed);
  px = foot.x;
  pz = foot.z;
  const target = Math.min(
    120,
    Math.round(100 * ctx.debug.pedDensity * walkerShare(clockHours(ctx.clock))),
  );
  let guard = 0;
  while (active < target && guard < 4) {
    guard += 1;
    const eid = idlePedestrian(world);
    if (eid < 0 || !wake(world, eid, px, pz)) break;
    active += 1;
  }
  if (punch) connectPunch(ctx, world, px, pz, facing, punchDamage);
  if (playerEid >= 0) Player.strike[playerEid] = 0;
  ctx.debug.npcs = active;
}

export function pedestrianVisual(ctx: GameContext, world: World): void {
  const focus = playerFocus(world);
  let yaw = Math.PI;
  for (const eid of players(world)) {
    yaw = CameraRig.yaw[eid] ?? yaw;
    break;
  }
  syncCrowd(ctx, world, focus.x, focus.z, yaw);
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
  Pedestrian.rammed[eid] = hurtRemaining(Pedestrian.rammed[eid] ?? 0, dt);
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
  if (state === PedState.Trip) {
    Pedestrian.speed[eid] = 0;
    Pedestrian.wait[eid] = (Pedestrian.wait[eid] ?? 0) - dt;
    if ((Pedestrian.wait[eid] ?? 0) <= 0) Pedestrian.state[eid] = PedState.Idle;
    return;
  }
  if (state === PedState.Fight) {
    fight(world, eid, dt, px, pz, playerEid, playerDriving);
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
    const arrived = slide(world, eid, Pedestrian.tx[eid] ?? 0, Pedestrian.tz[eid] ?? 0, 4.4, dt);
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
  if (!slide(world, eid, tx, tz, speed, dt)) {
    if ((Pedestrian.speed[eid] ?? 0) > 0) {
      Pedestrian.stuck[eid] = 0;
      return;
    }
    // Two walkers head-on block each other forever. Give up and pick a new errand.
    const stuck = (Pedestrian.stuck[eid] ?? 0) + dt;
    Pedestrian.stuck[eid] = stuck;
    if (stuck < STUCK_SECONDS) return;
    Pedestrian.stuck[eid] = 0;
    Pedestrian.state[eid] = PedState.Idle;
    Pedestrian.wait[eid] = 0.3 + (eid % 4) * 0.35;
    Pedestrian.count[eid] = 0;
    return;
  }
  Pedestrian.stuck[eid] = 0;
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

function wake(world: World, eid: number, px: number, pz: number): boolean {
  const walks = buildCostaVerde().walks;
  salt = (salt * 17 + 3) % 10007;
  for (let n = 0; n < 24; n += 1) {
    const quad = walks[(salt + n) % walks.length];
    if (!quad || quad.crosswalk) continue;
    const x = (quad.ax + quad.cx) / 2;
    const z = (quad.az + quad.cz) / 2;
    const distance = Math.hypot(x - px, z - pz);
    if (distance < 18 || distance > 70) continue;
    if (spotBusy(world, x, z)) continue;
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
    freshBody(eid);
    return true;
  }
  return false;
}

function spotBusy(world: World, x: number, z: number): boolean {
  for (const other of pedestrians(world)) {
    if ((Pedestrian.active[other] ?? 0) === 0) continue;
    if (circlesOverlap(x, z, Transform.px[other] ?? 0, Transform.pz[other] ?? 0, BODY_REACH)) {
      return true;
    }
  }
  return false;
}
