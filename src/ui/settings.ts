/** Player preferences chosen on the start screen and applied at launch. */

import { z } from 'zod';
import { sim } from '../content/sim';
import {
  shadowQualities,
  sharpnessLevels,
  type ShadowQuality,
  type Sharpness,
} from '../engine/render/display';

export const SETTINGS_KEY = 'bairro-settings';

export const spawnNames = ['centro', 'jurere', 'norte', 'leste', 'sul'] as const;

export type SpawnName = (typeof spawnNames)[number];

export interface GameSettings {
  mouseScale: number;
  volume: number;
  shadows: ShadowQuality;
  sharpness: Sharpness;
  admin: boolean;
  spawn: SpawnName;
}

export const defaultSettings: GameSettings = {
  mouseScale: 1,
  volume: 1,
  shadows: 'high',
  sharpness: 'high',
  admin: true,
  spawn: 'centro',
};

const settingsSchema = z.object({
  mouseScale: z.number().min(0.4).max(2.5),
  volume: z.number().min(0).max(1),
  shadows: z.enum(shadowQualities),
  sharpness: z.enum(sharpnessLevels),
  admin: z.boolean().default(true),
  spawn: z.enum(spawnNames).default('centro'),
});

export interface SettingsStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function lookSensitivity(settings: GameSettings): number {
  return sim.mouseSensitivity * settings.mouseScale;
}

export function loadSettings(store: SettingsStore = browserStore()): GameSettings {
  const raw = store.get(SETTINGS_KEY);
  if (!raw) return { ...defaultSettings };
  try {
    return settingsSchema.parse(JSON.parse(raw));
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: GameSettings, store: SettingsStore = browserStore()): void {
  store.set(SETTINGS_KEY, JSON.stringify(settingsSchema.parse(settings)));
}

function browserStore(): SettingsStore {
  return {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* private mode or a full quota keeps the session defaults */
      }
    },
  };
}
