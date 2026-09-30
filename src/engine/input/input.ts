/** Polled player actions for one displayed frame. The returned object is reused. */

import type { Disposable } from '../core/disposable';

export interface InputSnapshot {
  moveX: number;
  moveZ: number;
  throttle: number;
  brake: number;
  steer: number;
  sprint: boolean;
  jump: boolean;
  punch: boolean;
  /** Short tap of sprint. A held sprint key stays false. */
  heavy: boolean;
  interact: boolean;
  handbrake: boolean;
  lookX: number;
  lookY: number;
  zoom: number;
  debugToggle: boolean;
  debugOverlay: boolean;
}

export interface Input extends Disposable {
  snapshot(): InputSnapshot;
  readonly pointerLocked: boolean;
  requestPointerLock(): void;
  releasePointer(): void;
  endFrame(): void;
}
