/** Dependency bag passed into every system. No service is reached through a global. */

import type { AssetManager } from '../assets/asset-manager';
import type { AudioBus } from '../audio/audio-bus';
import type { Input } from '../input/input';
import type { PhysicsWorld } from '../physics/physics-world';
import type { NavMesh } from '../nav/nav-mesh';
import type { Renderer } from '../render/renderer';
import type { EventBus } from './event-bus';
import type { Logger } from './logger';
import type { Clock } from './time';

export interface GameEvents {
  'player:entered-vehicle': { vehicle: number };
  'player:exited-vehicle': { vehicle: number };
  'pedestrian:hit': { pedestrian: number; speed: number };
  'vehicle:collision': { vehicle: number; speed: number };
}

export interface DebugState {
  trafficDensity: number;
  pedDensity: number;
  showGraph: boolean;
  npcs: number;
  traffic: number;
  chunks: number;
}

export interface LookTuning {
  /** Radians of camera yaw per pixel of mouse movement. */
  mouseSensitivity: number;
}

export interface GameContext {
  readonly time: Clock;
  readonly events: EventBus<GameEvents>;
  readonly log: Logger;
  readonly input: Input;
  readonly physics: PhysicsWorld;
  readonly renderer: Renderer;
  readonly nav: NavMesh;
  readonly audio: AudioBus;
  readonly assets: AssetManager;
  readonly look: LookTuning;
  readonly debug: DebugState;
}
