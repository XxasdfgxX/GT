import { describe, expect, it } from 'vitest';
import { sim } from '../content/sim';
import { readHud } from '../game/play/read-hud';
import { createGameWorld } from '../game/ecs/world';
import {
  defaultSettings,
  loadSettings,
  lookSensitivity,
  saveSettings,
  SETTINGS_KEY,
  type SettingsStore,
} from '../ui/settings';

function memoryStore(initial?: string): SettingsStore & { saved: string | null } {
  const saved = { value: initial ?? null };
  return {
    get saved() {
      return saved.value;
    },
    get(key) {
      return key === SETTINGS_KEY ? saved.value : null;
    },
    set(key, value) {
      if (key === SETTINGS_KEY) saved.value = value;
    },
  };
}

describe('start settings', () => {
  it('keeps the current feel when nothing was saved', () => {
    const settings = loadSettings(memoryStore());
    expect(settings).toEqual(defaultSettings);
    expect(lookSensitivity(settings)).toBe(sim.mouseSensitivity);
  });

  it('round-trips a quieter, softer setup', () => {
    const store = memoryStore();
    saveSettings(
      {
        mouseScale: 0.5,
        volume: 0.2,
        shadows: 'off',
        sharpness: 'low',
        admin: true,
        spawn: 'centro',
      },
      store,
    );
    expect(loadSettings(store)).toEqual({
      mouseScale: 0.5,
      volume: 0.2,
      shadows: 'off',
      sharpness: 'low',
      admin: true,
      spawn: 'centro',
    });
  });

  it('ignores a broken save', () => {
    expect(loadSettings(memoryStore('{'))).toEqual(defaultSettings);
  });

  it('fills admin mode when an older save has no spawn fields', () => {
    const store = memoryStore(
      JSON.stringify({ mouseScale: 0.5, volume: 0.2, shadows: 'off', sharpness: 'low' }),
    );
    expect(loadSettings(store)).toEqual({
      mouseScale: 0.5,
      volume: 0.2,
      shadows: 'off',
      sharpness: 'low',
      admin: true,
      spawn: 'centro',
    });
  });

  it('round-trips admin off at jurere', () => {
    const store = memoryStore();
    saveSettings({ ...defaultSettings, admin: false, spawn: 'jurere' }, store);
    expect(loadSettings(store)).toMatchObject({ admin: false, spawn: 'jurere' });
  });

  it('drops a save whose bairro is not in the list', () => {
    const store = memoryStore(
      JSON.stringify({
        mouseScale: 1,
        volume: 1,
        shadows: 'high',
        sharpness: 'high',
        spawn: 'mar',
      }),
    );
    expect(loadSettings(store)).toMatchObject({ admin: true, spawn: 'centro' });
  });
});

describe('hud without a mission', () => {
  it('reports that no delivery is active', () => {
    expect(readHud(createGameWorld()).hasMission).toBe(false);
  });
});
