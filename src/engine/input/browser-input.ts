/** Keyboard and mouse bound to a canvas. Pointer lock keeps the aim cursor inside the view. */

import { stepAimCursor } from './aim-cursor';
import type { Input, InputSnapshot } from './input';

/** A sprint press shorter than this is a heavy punch. Held longer, it is a sprint. */
const HEAVY_TAP_MS = 200;

const EMPTY: InputSnapshot = {
  moveX: 0,
  moveZ: 0,
  throttle: 0,
  brake: 0,
  steer: 0,
  sprint: false,
  jump: false,
  punch: false,
  heavy: false,
  interact: false,
  handbrake: false,
  lookX: 0,
  lookY: 0,
  zoom: 0,
  aimX: 0,
  aimY: 0,
  viewWidth: 0,
  viewHeight: 0,
  debugToggle: false,
  debugOverlay: false,
  scoreToggle: false,
  timeSkip: 0,
};

export function createBrowserInput(target: HTMLElement): Input {
  const keys = new Set<string>();
  const pressed = new Set<string>();
  let lookX = 0;
  let lookY = 0;
  let zoom = 0;
  let aimX = 0;
  let aimY = 0;
  let heavyAttack = false;
  let sprintDownAt = -1;
  let pointerLocked = false;
  const snapshot: InputSnapshot = { ...EMPTY };

  const onKeyDown = (event: KeyboardEvent) => {
    // Letters typed into the menu belong to the field, not to the player.
    if (event.repeat || isTypingTarget(event.target)) return;
    if (isGameKey(event.code)) event.preventDefault();
    keys.add(event.code);
    pressed.add(event.code);
    if (event.code === 'KeyS') sprintDownAt = performance.now();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.code);
    if (event.code !== 'KeyS' || sprintDownAt < 0) return;
    // Decided here, not when a frame samples: a tap between two frames still counts.
    if (performance.now() - sprintDownAt < HEAVY_TAP_MS) heavyAttack = true;
    sprintDownAt = -1;
  };
  const reset = () => {
    keys.clear();
    pressed.clear();
    heavyAttack = false;
    sprintDownAt = -1;
    lookX = 0;
    lookY = 0;
    zoom = 0;
  };
  // A key released while the window is away never sends keyup.
  const onBlur = () => {
    reset();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') reset();
  };
  const lockPointer = () => {
    // Chrome refuses a relock right after Esc and rejects the promise.
    const request: unknown = target.requestPointerLock();
    if (request instanceof Promise) request.catch(() => undefined);
  };
  const onMouseMove = (event: MouseEvent) => {
    if (!pointerLocked) return;
    const orbiting = (event.buttons & 4) !== 0;
    if (orbiting) {
      lookX += event.movementX;
      lookY += event.movementY;
      return;
    }
    const next = stepAimCursor(
      aimX,
      aimY,
      event.movementX,
      event.movementY,
      target.clientWidth,
      target.clientHeight,
      false,
    );
    aimX = next.x;
    aimY = next.y;
  };
  const onLockChange = () => {
    pointerLocked = document.pointerLockElement === target;
    if (!pointerLocked) return;
    aimX = target.clientWidth / 2;
    aimY = target.clientHeight / 2;
  };
  const onMouseDown = (event: MouseEvent) => {
    if (event.button === 1) event.preventDefault();
  };
  const onAuxClick = (event: MouseEvent) => {
    event.preventDefault();
  };
  const onClick = () => {
    if (document.pointerLockElement !== target) lockPointer();
  };
  const onContext = (event: Event) => {
    event.preventDefault();
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    zoom += event.deltaY;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('auxclick', onAuxClick);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('pointerlockchange', onLockChange);
  target.addEventListener('click', onClick);
  target.addEventListener('contextmenu', onContext);
  target.addEventListener('wheel', onWheel, { passive: false });

  return {
    get pointerLocked() {
      return pointerLocked;
    },
    requestPointerLock() {
      lockPointer();
    },
    releasePointer() {
      if (document.pointerLockElement === target) document.exitPointerLock();
    },
    snapshot() {
      const left = keys.has('ArrowLeft');
      const right = keys.has('ArrowRight');
      const forward = keys.has('ArrowUp');
      const back = keys.has('ArrowDown');
      snapshot.sprint = sprintDownAt >= 0 && performance.now() - sprintDownAt >= HEAVY_TAP_MS;
      snapshot.moveX = (right ? 1 : 0) - (left ? 1 : 0);
      snapshot.moveZ = (forward ? 1 : 0) - (back ? 1 : 0);
      snapshot.throttle = forward ? 1 : 0;
      snapshot.brake = back ? 1 : 0;
      snapshot.steer = snapshot.moveX;
      snapshot.jump = pressed.has('KeyA');
      snapshot.heavy = heavyAttack;
      snapshot.punch = pressed.has('KeyD') || heavyAttack;
      snapshot.handbrake = keys.has('Space');
      snapshot.interact = pressed.has('KeyW');
      snapshot.lookX = pointerLocked ? lookX : 0;
      snapshot.lookY = pointerLocked ? lookY : 0;
      const viewWidth = target.clientWidth;
      const viewHeight = target.clientHeight;
      const aim = stepAimCursor(aimX, aimY, 0, 0, viewWidth, viewHeight, false);
      aimX = aim.x;
      aimY = aim.y;
      snapshot.aimX = aimX;
      snapshot.aimY = aimY;
      snapshot.viewWidth = viewWidth;
      snapshot.viewHeight = viewHeight;
      snapshot.zoom = zoom;
      snapshot.debugToggle = pressed.has('F3');
      snapshot.debugOverlay = pressed.has('F4');
      snapshot.scoreToggle = pressed.has('KeyH');
      snapshot.timeSkip = pressed.has('F6')
        ? keys.has('ShiftLeft') || keys.has('ShiftRight')
          ? -1
          : 1
        : 0;
      return snapshot;
    },
    reset,
    endFrame() {
      pressed.clear();
      heavyAttack = false;
      lookX = 0;
      lookY = 0;
      zoom = 0;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('auxclick', onAuxClick);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerlockchange', onLockChange);
      target.removeEventListener('click', onClick);
      target.removeEventListener('contextmenu', onContext);
      target.removeEventListener('wheel', onWheel);
    },
  };
}

/** A text field or editable element has the keyboard. Duck-typed so tests need no DOM. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  if (element.isContentEditable === true) return true;
  return (
    element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT'
  );
}

function isGameKey(code: string): boolean {
  return (
    code === 'Space' ||
    code === 'F3' ||
    code === 'F4' ||
    code === 'F6' ||
    code === 'KeyH' ||
    code === 'KeyW' ||
    code === 'KeyA' ||
    code === 'KeyS' ||
    code === 'KeyD' ||
    code === 'ArrowUp' ||
    code === 'ArrowDown' ||
    code === 'ArrowLeft' ||
    code === 'ArrowRight'
  );
}
