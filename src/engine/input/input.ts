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
  /** Aim cursor, in CSS pixels of the canvas. */
  aimX: number;
  aimY: number;
  viewWidth: number;
  viewHeight: number;
  debugToggle: boolean;
  debugOverlay: boolean;
  scoreToggle: boolean;
}

export interface Input extends Disposable {
  snapshot(): InputSnapshot;
  readonly pointerLocked: boolean;
  requestPointerLock(): void;
  releasePointer(): void;
  /** Forgets held and pressed keys. Pause, resume and losing focus call it. */
  reset(): void;
  endFrame(): void;
}
