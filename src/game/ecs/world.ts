/** Creates an empty bitecs world. Simulation state lives in components, not here. */

import { createWorld, type World } from 'bitecs';

export function createGameWorld(): World {
  return createWorld();
}
