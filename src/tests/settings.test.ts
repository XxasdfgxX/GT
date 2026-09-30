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
    saveSettings({ mouseScale: 0.5, volume: 0.2, shadows: 'off', sharpness: 'low' }, store);
    expect(loadSettings(store)).toEqual({
      mouseScale: 0.5,
      volume: 0.2,
      shadows: 'off',
      sharpness: 'low',
    });
  });

  it('ignores a broken save', () => {
    expect(loadSettings(memoryStore('{'))).toEqual(defaultSettings);
  });
});

describe('hud without a mission', () => {
  it('reports that no delivery is active', () => {
    expect(readHud(createGameWorld()).hasMission).toBe(false);
  });
});
