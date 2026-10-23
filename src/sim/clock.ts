/** The game clock: one game minute per real second, so a day lasts 24 real minutes. */

export interface GameClock {
  /** Minutes since midnight, 0 up to (not including) 1440. */
  minutes: number;
}

export const MINUTES_PER_DAY = 24 * 60;
export const MINUTES_PER_SECOND = 1;
/** Solo play and new rooms start at 09:00, in daylight. */
export const DAY_START = 9 * 60;

export function createGameClock(minutes = DAY_START): GameClock {
  return { minutes: wrapMinutes(minutes) };
}

export function wrapMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return DAY_START;
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function advanceClock(clock: GameClock, seconds: number): void {
  clock.minutes = wrapMinutes(clock.minutes + seconds * MINUTES_PER_SECOND);
}

/** The time of day `seconds` after a clock started at `DAY_START`. The room clock. */
export function clockAt(seconds: number): number {
  return wrapMinutes(DAY_START + seconds * MINUTES_PER_SECOND);
}

export function clockHours(clock: GameClock): number {
  return clock.minutes / 60;
}

/** 0 at midnight, 0.5 at noon: what the renderer's time of day takes. */
export function dayFraction(clock: GameClock): number {
  return clock.minutes / MINUTES_PER_DAY;
}

export function formatClock(clock: GameClock): string {
  const whole = Math.floor(clock.minutes);
  const hours = Math.floor(whole / 60);
  const minutes = whole % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
