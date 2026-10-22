/**
 * Queries used by systems. bitecs returns a live array that it keeps current as
 * entities gain components. Entities are pooled and never removed, so each query
 * keeps that array per world instead of hashing its term list on every call.
 */

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
  Pickup,
} from './components';

type Terms = Parameters<typeof query>[1];

function live(terms: Terms): (world: World) => QueryResult {
  const results = new WeakMap<World, QueryResult>();
  return (world) => {
    let result = results.get(world);
    if (!result) {
      result = query(world, terms);
      results.set(world, result);
    }
    return result;
  };
}

export const players = live([
  Player,
  Transform,
  Velocity,
  InputState,
  PhysicsRef,
  RenderRef,
  CameraRig,
]);

export const vehicles = live([Vehicle, Transform, PhysicsRef, RenderRef]);

export const missions = live([Mission]);

export const traffic = live([Traffic, Transform, PhysicsRef, RenderRef]);

export const pedestrians = live([Pedestrian, Transform, RenderRef]);

export const pickups = live([Pickup, Transform, RenderRef]);

export const wheels = live([Wheel, Transform, RenderRef]);

export const simulated = live([Transform, PhysicsRef]);

export const rendered = live([Transform, RenderRef]);
