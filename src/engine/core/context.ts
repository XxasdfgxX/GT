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
  showColliders: boolean;
  npcs: number;
  traffic: number;
  chunks: number;
}

export interface LookTuning {
  /** Radians of camera yaw per pixel of mouse movement. */
  mouseSensitivity: number;
}

export interface NetPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface NetPunch extends NetPose {
  serial: number;
  heavy: boolean;
}

export interface NetPlayer extends NetPose {
  id: number;
  name: string;
  swing: number;
  car: number;
  health: number;
  down: number;
}

export interface NetRosterEntry {
  id: number;
  name: string;
  kills: number;
  npcKills: number;
  deaths: number;
  playerDeaths: number;
  npcDeaths: number;
  alive: boolean;
}

export interface NetNpc extends NetPose {
  id: number;
  health: number;
  down: number;
}

export interface NetPickup {
  id: number;
  x: number;
  y: number;
  z: number;
  amount: number;
}

export interface NetCar extends NetPose {
  id: number;
  variant: number;
  driver: number;
}

export interface NetCorpse extends NetPose {
  id: number;
  kind: number;
  variant: number;
}

export interface NetSnapshot {
  self: {
    health: number;
    cash: number;
    alive: boolean;
    placeSerial: number;
    place: { x: number; y: number; z: number };
    name: string;
    kills: number;
    npcKills: number;
    deaths: number;
    playerDeaths: number;
    npcDeaths: number;
    car: number;
    down: number;
  };
  players: readonly NetPlayer[];
  npcs: readonly NetNpc[];
  cars: readonly NetCar[];
  pickups: readonly NetPickup[];
  corpses: readonly NetCorpse[];
  roster: readonly NetRosterEntry[];
}

export interface NetLink {
  readonly selfId: number;
  sendPose(pose: NetPose): void;
  sendPunch(punch: NetPunch): void;
  sendPickup(id: number): void;
  sendEnter(id: number): void;
  sendExit(): void;
  state(): NetSnapshot | null;
  close(): void;
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
  readonly net: NetLink | null;
}
