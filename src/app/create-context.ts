/** Builds the context from already constructed services. */

import type { AssetManager } from '../engine/assets/asset-manager';
import type { AudioBus } from '../engine/audio/audio-bus';
import { EventBus } from '../engine/core/event-bus';
import type { GameContext, GameEvents } from '../engine/core/context';
import { createConsoleLogger } from '../engine/core/logger';
import { createClock } from '../engine/core/time';
import type { Input } from '../engine/input/input';
import type { PhysicsWorld } from '../engine/physics/physics-world';
import type { Renderer } from '../engine/render/renderer';
import { sim } from '../content/sim';

export interface Services {
  input: Input;
  physics: PhysicsWorld;
  renderer: Renderer;
  audio: AudioBus;
  assets: AssetManager;
}

export function createContext(services: Services): GameContext {
  return {
    time: createClock(sim.fixedDt),
    events: new EventBus<GameEvents>(),
    log: createConsoleLogger(),
    input: services.input,
    physics: services.physics,
    renderer: services.renderer,
    audio: services.audio,
    assets: services.assets,
  };
}
