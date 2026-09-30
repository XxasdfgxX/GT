/** Enters a room car once the server gives the seat, and drives it with the local vehicle. */

import type { World } from 'bitecs';
import { engineForceFor, maxSpeedMs } from '../../content/cars';
import { STREET_LIFT } from '../../content/map/road-mesh';
import { sim } from '../../content/sim';
import { trafficCatalog } from '../../content/traffic-catalog';
import type { GameContext, NetCar } from '../../engine/core/context';
import { quatFromYaw } from '../../engine/core/math';
import { nearestOpenCar } from '../../net/ride';
import { InputState, PhysicsRef, Player, RenderRef, Transform, Vehicle } from '../ecs/components';
import { players } from '../ecs/queries';
import { spawnVehicle } from '../features/vehicles/spawn-vehicle';
import { hideBody } from '../features/player/place-player';
import { interactPrompt } from '../play/feel';
import { boardVehicle, leaveVehicle } from './interaction';
import { Mode } from './player-movement';

const rotation = { x: 0, y: 0, z: 0, w: 1 };
const paint = new Map<number, number>();
let rideEid = 0;
let mounted = 0;

export function resetNetRide(): void {
  rideEid = 0;
  mounted = 0;
  paint.clear();
}

export function netRideSystem(ctx: GameContext, world: World): void {
  const net = ctx.net;
  const state = net?.state();
  if (!net || !state) return;
  for (const eid of players(world)) {
    const wanted = state.self.alive ? state.self.car : 0;
    const car = state.cars.find((item) => item.id === wanted);
    if (wanted !== 0 && car && mounted !== wanted) mount(ctx, world, eid, car);
    else if ((wanted === 0 || !car) && mounted !== 0) dismount(ctx, world, eid, state.self.alive);

    const open = nearestOpenCar(state.cars, Transform.px[eid] ?? 0, Transform.pz[eid] ?? 0);
    Player.prompt[eid] = interactPrompt(
      Player.mode[eid] === Mode.Driving,
      open?.distance ?? Number.POSITIVE_INFINITY,
      sim.interactDistance,
    );
    if (InputState.interact[eid] !== 1) continue;
    InputState.interact[eid] = 0;
    if (mounted !== 0 || state.self.car !== 0) net.sendExit();
    else if (open && open.distance <= sim.interactDistance) net.sendEnter(open.id);
  }
}

function mount(ctx: GameContext, world: World, eid: number, car: NetCar): void {
  const ride = ensureRide(ctx, world, car);
  const spec = trafficCatalog[car.variant] ?? trafficCatalog[0];
  if (spec) {
    Vehicle.maxSpeed[ride] = maxSpeedMs(spec.maxSpeedKmh);
    const powered = PhysicsRef.body[ride] ?? 0;
    if (powered !== 0) ctx.physics.setVehiclePower(powered, engineForceFor(spec.torque));
  }
  const body = PhysicsRef.body[ride] ?? 0;
  if (body !== 0) {
    ctx.physics.setBodyEnabled(body, true);
    quatFromYaw(car.yaw, rotation);
    ctx.physics.setTransform(body, { x: car.x, y: car.y, z: car.z }, rotation);
  }
  plant(ride, car.x, car.y, car.z, car.yaw);
  RenderRef.mesh[ride] = showVariant(ctx, car.variant);
  boardVehicle(ctx, eid, ride);
  mounted = car.id;
}

function dismount(ctx: GameContext, world: World, eid: number, alive: boolean): void {
  leaveVehicle(ctx, world, eid);
  for (const mesh of paint.values()) ctx.renderer.setMeshVisible(mesh, false);
  const body = PhysicsRef.body[rideEid] ?? 0;
  if (body !== 0) ctx.physics.setBodyEnabled(body, false);
  Vehicle.occupied[rideEid] = 0;
  mounted = 0;
  if (!alive) hideBody(ctx, eid);
}

function ensureRide(ctx: GameContext, world: World, car: NetCar): number {
  if (rideEid !== 0) return rideEid;
  rideEid = spawnVehicle(ctx, world, { x: car.x, y: car.y, z: car.z, yaw: car.yaw }, 'sedan');
  const stock = RenderRef.mesh[rideEid] ?? 0;
  if (stock !== 0) ctx.renderer.setMeshVisible(stock, false);
  return rideEid;
}

function showVariant(ctx: GameContext, variant: number): number {
  for (const [id, mesh] of paint) ctx.renderer.setMeshVisible(mesh, id === variant);
  const found = paint.get(variant);
  if (found) {
    ctx.renderer.setMeshVisible(found, true);
    return found;
  }
  const spec = trafficCatalog[variant] ?? trafficCatalog[0];
  if (!spec) return 0;
  const mesh = ctx.renderer.addModel({
    url: spec.url,
    position: { x: 0, y: -40, z: 0 },
    scale: spec.scale,
    offset: { x: 0, y: STREET_LIFT - spec.height / 2, z: 0 },
    tint: spec.color,
  });
  paint.set(variant, mesh);
  return mesh;
}

function plant(eid: number, x: number, y: number, z: number, yaw: number): void {
  quatFromYaw(yaw, rotation);
  Transform.px[eid] = x;
  Transform.py[eid] = y;
  Transform.pz[eid] = z;
  Transform.ppx[eid] = x;
  Transform.ppy[eid] = y;
  Transform.ppz[eid] = z;
  Transform.qx[eid] = rotation.x;
  Transform.qy[eid] = rotation.y;
  Transform.qz[eid] = rotation.z;
  Transform.qw[eid] = rotation.w;
  Transform.pqx[eid] = rotation.x;
  Transform.pqy[eid] = rotation.y;
  Transform.pqz[eid] = rotation.z;
  Transform.pqw[eid] = rotation.w;
}
