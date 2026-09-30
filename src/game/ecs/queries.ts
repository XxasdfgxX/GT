/** Queries used by systems. bitecs caches the query for a term list. */

import { query, type QueryResult, type World } from 'bitecs';
import {
  CameraRig,
  InputState,
  PhysicsRef,
  Player,
  RenderRef,
  Transform,
  Mission,
  Vehicle,
  Velocity,
  Wheel,
  Traffic,
  Pedestrian,
} from './components';

export function players(world: World): QueryResult {
  return query(world, [Player, Transform, Velocity, InputState, PhysicsRef, RenderRef, CameraRig]);
}

export function vehicles(world: World): QueryResult {
  return query(world, [Vehicle, Transform, PhysicsRef, RenderRef]);
}

export function missions(world: World): QueryResult {
  return query(world, [Mission]);
}

export function traffic(world: World): QueryResult {
  return query(world, [Traffic, Transform, PhysicsRef, RenderRef]);
}

export function pedestrians(world: World): QueryResult {
  return query(world, [Pedestrian, Transform, RenderRef]);
}

export function wheels(world: World): QueryResult {
  return query(world, [Wheel, Transform, RenderRef]);
}

export function simulated(world: World): QueryResult {
  return query(world, [Transform, PhysicsRef]);
}

export function rendered(world: World): QueryResult {
  return query(world, [Transform, RenderRef]);
}
