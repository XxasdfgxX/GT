/** Where a standing body sits on the ground. */

import { sampleHeight } from '../../content/map/island-shape';
import { sim } from '../../content/sim';

/** Capsule center height for a body standing at (x, z). */
export function capsuleFloor(x: number, z: number): number {
  return sampleHeight(x, z) + sim.playerRadius + sim.playerHalfHeight;
}
