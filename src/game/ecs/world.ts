/** Creates an empty bitecs world. Simulation state lives in components, not here. */

import { createWorld, type World } from 'bitecs';
import { clearComponents } from './components';

/** One world at a time: a new one wipes the component arrays the last one used. */
export function createGameWorld(): World {
  clearComponents();
  return createWorld();
}
