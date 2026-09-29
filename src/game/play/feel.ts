/** Pure driving feedback: speed, prompt, engine tone, and the delivery step. */

import { MissionPhase, stepMission, type MissionState } from './mission';
import { PromptCode } from './prompt';

export interface EngineTone {
  frequency: number;
  gain: number;
}

export function speedKmh(metersPerSecond: number): number {
  return Math.round(Math.abs(metersPerSecond) * 3.6);
}

export function interactPrompt(driving: boolean, distance: number, range: number): number {
  if (driving) return PromptCode.Exit;
  if (distance <= range) return PromptCode.Enter;
  return PromptCode.None;
}

export function enginePlayback(active: boolean, speed: number, throttle: number): EngineTone {
  if (!active) return { frequency: 0, gain: 0 };
  const pace = Math.abs(speed);
  return {
    frequency: 46 + pace * 3.4 + throttle * 22,
    gain: 0.045 + Math.min(pace, 28) * 0.0035 + throttle * 0.025,
  };
}

export { MissionPhase, stepMission };
export type { MissionState };
