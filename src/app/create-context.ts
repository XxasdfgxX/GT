/** Builds the context from already constructed services. */

import type { AssetManager } from '../engine/assets/asset-manager';
import type { AudioBus } from '../engine/audio/audio-bus';
import { EventBus } from '../engine/core/event-bus';
import type { GameContext, GameEvents } from '../engine/core/context';
import { createConsoleLogger } from '../engine/core/logger';
import { createClock } from '../engine/core/time';
import type { Input } from '../engine/input/input';
import type { PhysicsWorld } from '../engine/physics/physics-world';
import type { NavMesh } from '../engine/nav/nav-mesh';
import type { Renderer } from '../engine/render/renderer';
import { sim } from '../content/sim';

export interface Services {
  input: Input;
  physics: PhysicsWorld;
  renderer: Renderer;
  nav: NavMesh;
  audio: AudioBus;
  assets: AssetManager;
  mouseSensitivity: number;
}

export function createContext(services: Services): GameContext {
  return {
    time: createClock(sim.fixedDt),
    events: new EventBus<GameEvents>(),
    log: createConsoleLogger(),
    input: services.input,
    physics: services.physics,
    renderer: services.renderer,
    nav: services.nav,
    audio: services.audio,
    assets: services.assets,
    look: { mouseSensitivity: services.mouseSensitivity },
    debug: {
      trafficDensity: 1,
      pedDensity: 1,
      showGraph: false,
      npcs: 0,
      traffic: 0,
      chunks: 0,
    },
  };
}
