/** Dependency bag passed into every system. No service is reached through a global. */

import type { AssetManager } from '../assets/asset-manager';
import type { AudioBus } from '../audio/audio-bus';
import type { Input } from '../input/input';
import type { PhysicsWorld } from '../physics/physics-world';
import type { Renderer } from '../render/renderer';
import type { EventBus } from './event-bus';
import type { Logger } from './logger';
import type { Clock } from './time';

export interface GameEvents {
  'player:entered-vehicle': { vehicle: number };
  'player:exited-vehicle': { vehicle: number };
}

export interface GameContext {
  readonly time: Clock;
  readonly events: EventBus<GameEvents>;
  readonly log: Logger;
  readonly input: Input;
  readonly physics: PhysicsWorld;
  readonly renderer: Renderer;
  readonly audio: AudioBus;
  readonly assets: AssetManager;
}
