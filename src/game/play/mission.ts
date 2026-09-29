/** One delivery: walk to the crate, then drive it to the pad. */

export const MissionPhase = {
  Pickup: 0,
  Deliver: 1,
  Done: 2,
} as const;

export interface MissionState {
  phase: number;
  time: number;
}

export function stepMission(
  state: MissionState,
  driving: boolean,
  pickupDistance: number,
  dropoffDistance: number,
  radius: number,
  dt: number,
): MissionState {
  if (state.phase === MissionPhase.Done) return state;
  if (state.phase === MissionPhase.Pickup) {
    if (!driving && pickupDistance <= radius) return { phase: MissionPhase.Deliver, time: 0 };
    return state;
  }
  const time = state.time + dt;
  if (driving && dropoffDistance <= radius) return { phase: MissionPhase.Done, time };
  return { phase: MissionPhase.Deliver, time };
}
