import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../engine/core/event-bus';

interface Events {
  'player:entered-vehicle': { vehicle: number };
  'debug:toggled': { visible: boolean };
}

describe('EventBus', () => {
  it('delivers a payload to a subscriber', () => {
    const bus = new EventBus<Events>();
    const heard = vi.fn();
    bus.on('player:entered-vehicle', heard);
    bus.emit('player:entered-vehicle', { vehicle: 4 });
    expect(heard).toHaveBeenCalledOnce();
    expect(heard).toHaveBeenCalledWith({ vehicle: 4 });
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new EventBus<Events>();
    const heard = vi.fn();
    const off = bus.on('debug:toggled', heard);
    off();
    bus.emit('debug:toggled', { visible: true });
    expect(heard).not.toHaveBeenCalled();
  });

  it('notifies every listener and ignores other events', () => {
    const bus = new EventBus<Events>();
    const a = vi.fn();
    const b = vi.fn();
    const other = vi.fn();
    bus.on('debug:toggled', a);
    bus.on('debug:toggled', b);
    bus.on('player:entered-vehicle', other);
    bus.emit('debug:toggled', { visible: false });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(other).not.toHaveBeenCalled();
  });

  it('allows emit when nobody is listening', () => {
    const bus = new EventBus<Events>();
    expect(() => bus.emit('debug:toggled', { visible: true })).not.toThrow();
  });
});
