/** Keyboard and mouse bound to a canvas. Pointer lock is required for look deltas. */

import type { Input, InputSnapshot } from './input';

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
  debugToggle: false,
  debugOverlay: false,
};

export function createBrowserInput(target: HTMLElement): Input {
  const keys = new Set<string>();
  const pressed = new Set<string>();
  let lookX = 0;
  let lookY = 0;
  let zoom = 0;
  let heavyAttack = false;
  let sprintDownAt = -1;
  let pointerLocked = false;
  const snapshot: InputSnapshot = { ...EMPTY };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return;
    if (isGameKey(event.code)) event.preventDefault();
    keys.add(event.code);
    pressed.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.code);
  };
  const onMouseMove = (event: MouseEvent) => {
    if (!pointerLocked) return;
    lookX += event.movementX;
    lookY += event.movementY;
  };
  const onLockChange = () => {
    pointerLocked = document.pointerLockElement === target;
  };
  const onClick = () => {
    if (document.pointerLockElement !== target) void target.requestPointerLock();
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
  document.addEventListener('pointerlockchange', onLockChange);
  target.addEventListener('click', onClick);
  target.addEventListener('contextmenu', onContext);
  target.addEventListener('wheel', onWheel, { passive: false });

  return {
    get pointerLocked() {
      return pointerLocked;
    },
    requestPointerLock() {
      void target.requestPointerLock();
    },
    releasePointer() {
      if (document.pointerLockElement === target) document.exitPointerLock();
    },
    snapshot() {
      const left = keys.has('ArrowLeft');
      const right = keys.has('ArrowRight');
      const forward = keys.has('ArrowUp');
      const back = keys.has('ArrowDown');
      const now = performance.now();
      const sprintKey = keys.has('KeyS');
      if (sprintKey) {
        if (sprintDownAt < 0) sprintDownAt = now;
        snapshot.sprint = now - sprintDownAt >= 200;
      } else {
        if (sprintDownAt >= 0 && now - sprintDownAt < 200) heavyAttack = true;
        sprintDownAt = -1;
        snapshot.sprint = false;
      }
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
      snapshot.zoom = zoom;
      snapshot.debugToggle = pressed.has('F3');
      snapshot.debugOverlay = pressed.has('F4');
      return snapshot;
    },
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
      document.removeEventListener('pointerlockchange', onLockChange);
      target.removeEventListener('click', onClick);
      target.removeEventListener('contextmenu', onContext);
      target.removeEventListener('wheel', onWheel);
    },
  };
}

function isGameKey(code: string): boolean {
  return (
    code === 'Space' ||
    code === 'F3' ||
    code === 'F4' ||
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
