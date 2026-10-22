import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserInput, isTypingTarget } from '../engine/input/browser-input';
import type { Input } from '../engine/input/input';

type Handler = (event: unknown) => void;

/** Records listeners so a test can fire events at window, document, or the canvas. */
function listenerHost<T extends object>(extra: T) {
  const handlers = new Map<string, Handler[]>();
  return {
    ...extra,
    addEventListener(type: string, handler: Handler) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
    },
    removeEventListener(type: string, handler: Handler) {
      handlers.set(
        type,
        (handlers.get(type) ?? []).filter((item) => item !== handler),
      );
    },
    fire(type: string, event: object = {}) {
      for (const handler of handlers.get(type) ?? []) handler(event);
    },
  };
}

let clock = 0;
let win: ReturnType<typeof listenerHost>;
let doc: ReturnType<typeof listenerHost<{ visibilityState: string; pointerLockElement: null }>>;
let input: Input;
const canvas = listenerHost({
  clientWidth: 800,
  clientHeight: 600,
  requestPointerLock: () => Promise.reject(new Error('Esc acabou de soltar o mouse')),
});

function key(type: 'keydown' | 'keyup', code: string, target: object = win): void {
  win.fire(type, { code, repeat: false, target, preventDefault: () => undefined });
}

beforeEach(() => {
  clock = 0;
  win = listenerHost({});
  doc = listenerHost({ visibilityState: 'visible', pointerLockElement: null });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('performance', { now: () => clock });
  input = createBrowserInput(canvas as unknown as HTMLElement);
});

afterEach(() => {
  input.dispose();
  vi.unstubAllGlobals();
});

describe('browser input', () => {
  it('knows a text field from the game canvas', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: 'CANVAS' } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it('leaves letters typed into the menu name field alone', () => {
    let prevented = false;
    win.fire('keydown', {
      code: 'KeyW',
      repeat: false,
      target: { tagName: 'INPUT' },
      preventDefault: () => (prevented = true),
    });
    expect(prevented).toBe(false);
    expect(input.snapshot().interact).toBe(false);
  });

  it('forgets keys from the menu once the game resumes', () => {
    key('keydown', 'KeyW');
    key('keydown', 'ArrowUp');
    input.reset();
    const view = input.snapshot();
    expect(view.interact).toBe(false);
    expect(view.throttle).toBe(0);
  });

  it('lets go of a held key when the window loses focus', () => {
    key('keydown', 'ArrowUp');
    expect(input.snapshot().throttle).toBe(1);
    win.fire('blur');
    expect(input.snapshot().throttle).toBe(0);
    key('keydown', 'ArrowUp');
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    expect(input.snapshot().throttle).toBe(0);
  });

  it('counts a heavy tap that starts and ends between two frames', () => {
    key('keydown', 'KeyS');
    clock = 80;
    key('keyup', 'KeyS');
    const view = input.snapshot();
    expect(view.heavy).toBe(true);
    expect(view.punch).toBe(true);
    expect(view.sprint).toBe(false);
  });

  it('turns a held sprint key into a sprint, not a punch', () => {
    key('keydown', 'KeyS');
    clock = 250;
    expect(input.snapshot().sprint).toBe(true);
    key('keyup', 'KeyS');
    expect(input.snapshot().heavy).toBe(false);
  });

  it('swallows a refused pointer lock instead of leaving the promise unhandled', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    canvas.fire('click');
    input.requestPointerLock();
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
